import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { findBatchResult } from '../../shared/bitrix/prepare-batch-results.util';
import { EventSalesFlowDto } from '../../event-report/dto/event-sale-flow/event-sales-flow.dto';
import { EventSalesFlowResponseDto } from '../../event-report/dto/response/event-sales-flow-response.dto';
import { EventReportInitService } from '../../event-report/services/init/event-report-init.service';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { EventReportEntityFlowService } from '../../event-report/services/entity/event-report-entity-flow.service';
import {
    ADD_TASK_CMD,
    EventReportTaskFlowService,
    parseAddedTaskId,
} from '../../event-report/services/task/event-report-task-flow.service';
import { EventReportKpiFlowService } from '../../event-report/services/kpi-list/event-report-kpi-flow.service';
import { EventReportTimelineService } from '../../event-report/services/timeline/event-report-timeline.service';
import { EventReportActingManagerService } from '../../event-report/services/acting-manager/event-report-acting-manager.service';
import { EventReportSettingsResolver } from '../../event-report/services/settings/event-report-settings.resolver';
import { DealFlowResult } from '../../event-report/services/deal/event-report-deal-flow.service';
import { PRESENTATION_QUEUE } from '../../event-report/services/post-flow/event-report-post-flow.service';
import {
    parseCreatedDealId,
    sideJobId,
} from '../../event-report/services/post-flow/side-flow-job.base';
import { ColdHookBatchGroupBuffer } from '../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { resolveTmcDeal, toTmcInitContext } from '../lib/tmc-init-context';
import {
    SET_TMC_DEAL_CMD,
    TmcBaseDealService,
} from '../services/tmc-base-deal.service';
import { TmcCloseOtherDealsService } from '../services/tmc-close-other-deals.service';
import { TmcPresentationRequestService } from '../services/tmc-presentation-request.service';
import { buildTmcPresentationRequestJob } from '../services/tmc-presentation-request-job.builder';

/**
 * Отчёт из режима «Менеджер ТМЦ» — зеркало легаси
 * `EventReportTMCBatchService` поверх общих сервисов отчёта.
 *
 * Чем отличается от отчёта отдела продаж ({@link EventReportUseCase}):
 *  1. база — сделка «ТМЦ Основная», сделки ОП (основная, ХО, презентации)
 *     не создаются и не двигаются ({@link toTmcInitContext});
 *  2. ДО батча прямыми вызовами закрываются лишние открытые сделки
 *     компании у этого менеджера ({@link TmcCloseOtherDealsService});
 *  3. план «Презентация» — не задача менеджеру ОП, а ЗАЯВКА: элемент РПА
 *     (пока жив бизнес-процесс согласования) + элемент смарта «Презентации»
 *     в стадии «Заявка» через сайд-очередь; саму презентацию менеджеру ОП
 *     планирует ручка согласования `tmc/presentation-approved`;
 *  4. поля компании — те же сервисы, но контекст ТМЦ: «Менеджер ТМЦ»
 *     вместо «Менеджера ОП», история с пометкой «ТМЦ» и лимитом 8, KPI без
 *     презентационных записей;
 *  5. нет пост-отказа, связи с заявками/лидами, возврата в ТМЦ, ЗПР —
 *     легаси-ТМЦ этого не делало.
 *
 * Шаги те же: init-батч → контекст → flow-сервисы кладут команды →
 * один `callBatchWithConcurrency(1)` → хвост (уведомления, сайд-очередь).
 */
@Injectable()
export class EventReportTmcUseCase {
    private readonly logger = new Logger(EventReportTmcUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly initService: EventReportInitService,
        private readonly settings: EventReportSettingsResolver,
        // Режим руководителя работает и в ТМЦ: пометка в истории/задаче/KPI
        // и уведомление сотруднику — тем же сервисом, что у отдела продаж.
        private readonly actingManager: EventReportActingManagerService,
        private readonly queue: QueueDispatcherService,
    ) {}

    async execute(
        dto: EventSalesFlowDto,
        socketId?: string,
    ): Promise<EventSalesFlowResponseDto> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);

        const init = await this.initService.loadContext(dto, bitrix, portal);
        const tmcDeal = resolveTmcDeal(init);
        const ctx = new EventReportContext(
            dto,
            portal,
            toTmcInitContext(init, tmcDeal),
        );
        ctx.setFieldPolicySettings(await this.settings.fieldPolicy(dto.domain));
        ctx.setActingManager(await this.actingManager.resolve(dto));

        const entityFlow = new EventReportEntityFlowService(bitrix, portal);
        const closeOthers = new TmcCloseOtherDealsService(bitrix, portal);
        const tmcDealFlow = new TmcBaseDealService(bitrix, portal);
        const taskFlow = new EventReportTaskFlowService(
            bitrix,
            portal,
            await this.settings.taskChecklistEnabled(dto.domain),
        );
        const kpiFlow = new EventReportKpiFlowService(bitrix, portal);
        const request = new TmcPresentationRequestService(bitrix, portal);
        const timeline = new EventReportTimelineService(bitrix);
        const buffer = new ColdHookBatchGroupBuffer(bitrix);

        // Чек-лист закрываемой задачи — до flow-сервисов: его итог уходит
        // в историю карточки, которую собирает entity-flow.
        await taskFlow.readClosingChecklist(ctx);
        // Удалённые лиды не должны попасть в привязки новой задачи: с ними
        // Битрикс не показывает её в карточке сделки. Тоже прямой вызов.
        await taskFlow.readMissingLeads(ctx);
        // Легаси: до батча — лишние открытые сделки менеджера по компании.
        const closed = await closeOthers.apply(ctx);

        entityFlow.queue(ctx);
        const deals = tmcDealFlow.queue(ctx);
        taskFlow.queue(ctx, deals);
        await kpiFlow.queue(ctx, deals, buffer);
        const rpaCmd = request.queue(ctx, deals.baseDealId);
        // Таймлайн — после сделки: её id при создании приезжает подстановкой.
        timeline.queue(ctx, deals);

        // Один HTTP-батч: буфер KPI шлёт весь накопленный cmdBatch, хвостовой
        // вызов добирает остаток (см. комментарий в EventReportUseCase).
        await buffer.endGroup();
        await buffer.flush();
        const results = await bitrix.api.callBatchWithConcurrency(1);
        const batchResults = [...buffer.getResults(), ...results];

        // im.notify не батчится — после основного батча, ошибки гасятся внутри.
        await taskFlow.notifyTransfer(ctx);
        await this.actingManager.notify(ctx, bitrix);

        // Заявка на презентацию в смарт — сайд-очередью после батча: реальные
        // id ТМЦ-сделки и задачи уже лежат в его ответе.
        await this.dispatchPresentationRequest(
            ctx,
            deals,
            batchResults,
            socketId,
        ).catch(error =>
            this.logger.warn(
                `${ctx.domain}: заявка на презентацию не поставлена в очередь смарта — ${(error as Error).message}`,
            ),
        );

        const commandsCount = batchResults.reduce(
            (sum, chunk) => sum + Object.keys(chunk.result ?? {}).length,
            0,
        );
        this.logger.log(
            `event-report-tmc executed: entity=${ctx.entityType}:${ctx.entityId}, ` +
                `tmcDeal=${deals.baseDealId ?? 'нет'}, closedOthers=${closed}, ` +
                `rpa=${rpaCmd ?? 'нет'}, commands=${commandsCount}`,
        );
        return {
            success: true,
            commandsCount,
            entityType: ctx.entityType,
            entityId: ctx.entityId,
        };
    }

    /**
     * Джоб `request` в очередь презентаций. ТМЦ-сделка — из контекста, а
     * созданная этим же батчем — из его ответа (`set_tmc_deal`); задача
     * ТМЦ-менеджера — оттуда же (`add_task`), к ней элемент привяжется.
     */
    private async dispatchPresentationRequest(
        ctx: EventReportContext,
        deals: DealFlowResult,
        batchResults: IBitrixBatchResponseResult[],
        socketId?: string,
    ): Promise<void> {
        const tmcDealId =
            Number(ctx.currentBaseDeal?.ID) ||
            (deals.baseDealId
                ? parseCreatedDealId(
                      findBatchResult(batchResults, SET_TMC_DEAL_CMD),
                  )
                : null);
        const job = buildTmcPresentationRequestJob({
            ctx,
            tmcDealId,
            planTaskId: parseAddedTaskId(
                findBatchResult(batchResults, ADD_TASK_CMD),
            ),
            socketId,
        });
        if (!job) return;

        await this.queue.dispatch(
            PRESENTATION_QUEUE.queue,
            PRESENTATION_QUEUE.job,
            job,
            sideJobId(ctx.dto.operationId, PRESENTATION_QUEUE.flow, 'request'),
            { removeOnComplete: true, removeOnFail: true },
        );
        this.logger.log(
            `[post-flow] ${ctx.domain}: заявка ТМЦ на презентацию поставлена ` +
                `в очередь смарта (tmcDeal=${tmcDealId ?? 'нет'}, ` +
                `task=${job.planTaskId ?? 'нет'})`,
        );
    }
}
