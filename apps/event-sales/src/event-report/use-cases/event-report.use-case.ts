import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    LeadUfDefinitions,
    LeadUfDefinitionsService,
} from '../../shared/portal-fields';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventReportInitService } from '../services/init/event-report-init.service';
import {
    EEventReportFlowStrategy,
    EventReportContext,
} from '../services/context/event-report.context';
import { EventReportEntityFlowService } from '../services/entity/event-report-entity-flow.service';
import { EventReportDealFlowService } from '../services/deal/event-report-deal-flow.service';
import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { EventReportKpiFlowService } from '../services/kpi-list/event-report-kpi-flow.service';
import { EventReportPresentationListService } from '../services/kpi-list/event-report-presentation-list.service';
import { EventReportPostFailService } from '../services/post-fail/event-report-post-fail.service';
import { EventReportLeadRelationService } from '../services/lead/event-report-lead-relation.service';
import { EventReportLeadRequestSyncService } from '../services/lead/event-report-lead-request-sync.service';
import { EventReportReturnToTmcService } from '../services/return-to-tmc/event-report-return-to-tmc.service';
import { EventReportEntityHistoryService } from '../services/history/event-report-entity-history.service';
import { ColdHookBatchGroupBuffer } from '../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { EEventReportEntityType } from '../services/init/event-report-init.types';
import { ZprFlowJobData } from '../../zpr-flow/dto/zpr-flow-job.dto';
import { PresentationFlowJobData } from '../../presentation-flow/dto/presentation-flow-job.dto';
import { derivePresentationOutcome } from '../../presentation-flow/lib/presentation-outcome';
import { buildPresentationSurveySnapshot } from '../../presentation-flow/lib/presentation-survey-snapshot';

/**
 * Оркестратор event-report flow.
 *
 * Шаги:
 *  1. `PBXService.init(domain)` — получить инстанс bitrix + portal.
 *  2. `EventReportInitService.loadContext` — один HTTP-batch:
 *     company/lead, deals по 4 категориям, task, lead, контакты.
 *  3. Сконструировать {@link EventReportContext} (все флаги).
 *  4. Прогнать flow-сервисы (entity → deal → task → kpi → presentation list →
 *     post-fail → lead → return-to-tmc → history) — каждый просто queue'ит
 *     команды в `bitrix.batch.*`.
 *  5. Один финальный `bitrix.api.callBatchWithConcurrency(1)` отправит всё
 *     одним HTTP-вызовом (рассчитываем на ≤50 команд).
 */
@Injectable()
export class EventReportUseCase {
    private readonly logger = new Logger(EventReportUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly initService: EventReportInitService,
        private readonly ufDefinitions: LeadUfDefinitionsService,
        private readonly queue: QueueDispatcherService,
        // Гейт чек-листов задач: настройка портала (Redis-кэш 300 с).
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    async execute(
        dto: EventSalesFlowDto,
        // Сокет клиента: уезжает в сайд-джобы, чтобы их `…:done` вернулся
        // точечно тому же клиенту (userId в роли адреса не годится — он
        // уникален только в рамках портала).
        socketId?: string,
    ): Promise<{
        success: boolean;
        commandsCount: number;
        entityType: string;
        entityId: number;
    }> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);

        const init = await this.initService.loadContext(dto, bitrix, portal);
        const ctx = new EventReportContext(dto, portal, init);

        const entityFlow = new EventReportEntityFlowService(bitrix, portal);
        const dealFlow = new EventReportDealFlowService(bitrix, portal);
        const taskFlow = new EventReportTaskFlowService(
            bitrix,
            portal,
            await this.isTaskChecklistEnabled(dto.domain),
        );
        const kpiFlow = new EventReportKpiFlowService(bitrix, portal);
        const presentationList = new EventReportPresentationListService(
            bitrix,
            portal,
        );
        const postFail = new EventReportPostFailService(bitrix, portal);
        const leadRelation = new EventReportLeadRelationService(bitrix, portal);
        const returnToTmc = new EventReportReturnToTmcService(bitrix, portal);
        const history = new EventReportEntityHistoryService(bitrix);

        // KPI использует тот же ColdHookBatchGroupBuffer (контракт KpiListFlowService).
        // По факту мы тут одна группа = весь endpoint; вся работа упадёт в один HTTP.
        const buffer = new ColdHookBatchGroupBuffer(bitrix);

        // Чек-лист ЗАКРЫВАЕМОЙ задачи читается ДО всех flow-сервисов:
        // его итог уезжает в историю карточки, а её собирает entity-flow —
        // первый в цепочке. Один прямой вызов, batch не трогается.
        await taskFlow.readClosingChecklist(ctx);

        // dealFlow сам выключается для leadOnly (ctx.isDealFlow), возврат в
        // ТМЦ — тоже про движение сделок, поэтому гейтится стратегией явно.
        entityFlow.queue(ctx);
        const deals = dealFlow.queue(ctx);
        taskFlow.queue(ctx, deals);
        // await: дедуп финалов/уникальных читает существующие элементы
        // прямыми вызовами (batch-аккумулятор не трогается — см. flowDedup).
        await kpiFlow.queue(ctx, deals, buffer);
        presentationList.queue(ctx, deals);
        postFail.queue(ctx);
        leadRelation.queue(ctx);
        if (ctx.strategy !== EEventReportFlowStrategy.LEAD_ONLY) {
            returnToTmc.queue(ctx);
        }
        history.queue(ctx);

        // Коммитим KPI группу + flush'им буфер. Также отправляем всё, что
        // напрямую закинули в bitrix.batch.* (entity/deal/task/etc.).
        await buffer.endGroup();
        await buffer.flush();
        const results = await bitrix.api.callBatchWithConcurrency(1);

        // Финал (продажа/отказ) двигает статусы связанных заявок/лидов и
        // дописывает историю обработки — отдельными волнами ПОСЛЕ основного
        // батча (multiple-история требует свежих значений лида).
        // Формат crm-значений (`to_sale_deal`) зависит от фактических
        // привязок поля на портале — читаем их (кэш 10 мин на домен),
        // иначе связь продажи молча не сохранится.
        const leadRequestSync = new EventReportLeadRequestSyncService(
            bitrix,
            portal,
            await this.leadLinkDefinitions(ctx.domain, bitrix, portal),
        );
        await leadRequestSync.run(ctx);

        // Перенос: сообщение ответственному — ПОСЛЕ основного батча
        // (im.notify не батчится), ошибка отправки гасится внутри и отчёт
        // не роняет (todo2508-02 №4б).
        await taskFlow.notifyTransfer(ctx);

        const commandsCount =
            results.reduce(
                (sum, chunk) => sum + Object.keys(chunk.result ?? {}).length,
                0,
            ) + buffer.getResults().length;

        // Сайд-flow ЗПР — отдельной очередью ПОСЛЕ основного: отчёт уже
        // «предварительно готов», элемент смарта доезжает асинхронно и не
        // удлиняет основной flow (решение владельца, 2508). Ошибка постановки
        // не роняет отчёт.
        await this.dispatchZprFlow(ctx, deals, socketId).catch(error =>
            this.logger.warn(
                `zpr-flow не поставлен в очередь: ${(error as Error).message}`,
            ),
        );

        // Сайд-flow презентаций — тем же принципом: элемент смарта
        // «Презентации» (зеркало сделок «ОП Презентации») доезжает отдельной
        // очередью. Сами pres-сделки уже отработали в основном батче —
        // смарт их НЕ заменяет и не отменяет.
        await this.dispatchPresentationFlow(ctx, deals, socketId).catch(error =>
            this.logger.warn(
                `presentation-flow не поставлен в очередь: ${(error as Error).message}`,
            ),
        );

        this.logger.log(
            `event-report executed: entity=${ctx.entityType}:${ctx.entityId}, strategy=${ctx.strategy}, commands=${commandsCount}`,
        );
        return {
            success: true,
            commandsCount,
            entityType: ctx.entityType,
            entityId: ctx.entityId,
        };
    }

    /**
     * Джобы сайд-очереди ЗПР: отчёт по задаче «Решение» закрывает элемент,
     * план «Решения» создаёт новый — оба могут случиться в одном отчёте
     * (отчитались и запланировали следующий), тогда джобов два, в этом же
     * порядке. Не «Решение» — очередь не трогаем.
     */
    private async dispatchZprFlow(
        ctx: EventReportContext,
        deals: { baseDealId: string | null },
        socketId?: string,
    ): Promise<void> {
        /*
         * Перенос (isExpired) — ОДИН джоб-move: задача та же, элемент тот же.
         * Пара report+plan здесь дала бы фантомное «не состоялся» плюс второй
         * открытый элемент (находка ревью).
         */
        const isMove = ctx.isExpired;
        const kinds: Array<'report' | 'plan'> = [];
        if (ctx.reportEventType === 'hot') kinds.push('report');
        if (!isMove && ctx.planEventType === 'hot' && ctx.isPlanned) {
            kinds.push('plan');
        }
        // Перенос план-only (без отчётного типа hot): двигаем по плану.
        if (isMove && !kinds.length && ctx.planEventType === 'hot') {
            kinds.push('report');
        }
        if (!kinds.length) return;

        // Ссылка `$result[...]` на создаваемую этим же отчётом сделку в джоб
        // не годится — batch уже отправлен, но числового id у нас нет.
        const numericBaseDealId = Number(
            ctx.currentBaseDeal?.ID ?? deals.baseDealId,
        );
        const baseDealId =
            Number.isFinite(numericBaseDealId) && numericBaseDealId > 0
                ? numericBaseDealId
                : null;

        const base: Omit<ZprFlowJobData, 'kind'> = {
            domain: ctx.domain,
            operationId: ctx.dto.operationId,
            socketId,
            baseDealId,
            presDealId: Number(ctx.currentPresDeal?.ID) || null,
            companyId:
                ctx.entityType === EEventReportEntityType.COMPANY
                    ? ctx.entityId
                    : Number(ctx.company?.ID) || null,
            leadId: Number(ctx.lead?.ID) || null,
            contactId:
                Number(
                    ctx.dto.plan?.contact?.ID ?? ctx.dto.report?.contact?.ID,
                ) || null,
            responsibleId: ctx.planResponsibleId,
            // Задача, по которой отчитываемся: элемент привяжется к ней в
            // UF_CRM_TASK (`T{hex}_{id}`) по завершении джоба.
            taskId: Number(ctx.currentTask?.id) || null,
            planDeadline: ctx.planDeadline?.toCrmDateTime() ?? null,
            planName: ctx.planEventName || null,
            planComment: ctx.reportComment || null,
            reportComment: ctx.reportComment || null,
            isResult: ctx.isResult,
            // Отказ (в т.ч. «не ЦА») закрывает звонок своей стадией.
            isFail: ctx.isFail || ctx.isNotCa,
        };

        for (const kind of kinds) {
            await this.queue.dispatch(
                QueueNames.EVENT_SALES_ZPR_FLOW,
                JobNames.EVENT_SALES_ZPR_FLOW,
                {
                    ...base,
                    kind,
                    isMove: kind === 'report' && isMove ? true : undefined,
                } satisfies ZprFlowJobData,
                undefined,
                { removeOnComplete: true, removeOnFail: true },
            );
        }
    }

    /**
     * Джобы сайд-очереди презентаций — зеркало dispatchZprFlow.
     *
     * Отчёт по презентации закрывает (или переносит) открытый элемент, план
     * презентации создаёт новый — оба могут случиться в одном отчёте
     * (отчитались и назначили следующую), тогда джобов два, и порядок
     * «сначала report, потом plan» обязателен: иначе новый элемент стал бы
     * «открытым» для собственного же отчёта.
     *
     * Спонтанная презентация (`isUnplannedPresentation`) тоже даёт report-джоб:
     * факт «презентация проведена» обязан фиксироваться всегда, даже когда
     * отчёт пришёл не по презентационной задаче.
     */
    private async dispatchPresentationFlow(
        ctx: EventReportContext,
        deals: { baseDealId: string | null },
        socketId?: string,
    ): Promise<void> {
        // Отчёт «по презентации»: либо презентацию провели (в т.ч. спонтанно),
        // либо отчитались по презентационной задаче (перенос/срыв/отказ).
        const isPresentationReport =
            ctx.isPresentationDone || ctx.reportEventType === 'presentation';
        const kinds: Array<'report' | 'plan'> = [];
        if (isPresentationReport) kinds.push('report');
        /*
         * Перенос (isExpired) — задача та же, элемент тот же: report-джоб
         * двинет его в «Перенос» (outcome moved), а plan-джоб создал бы
         * ВТОРОЙ открытый элемент, и pending-элемент утёк бы навсегда
         * вместе со счётчиком переносов (находка ревью).
         */
        const isMove = ctx.isExpired && isPresentationReport;
        if (!isMove && ctx.planEventType === 'presentation' && ctx.isPlanned) {
            kinds.push('plan');
        }
        if (!kinds.length) return;

        // Ссылка `$result[...]` на создаваемую этим же отчётом сделку в джоб
        // не годится — batch уже отправлен, но числового id у нас нет.
        const numericBaseDealId = Number(
            ctx.currentBaseDeal?.ID ?? deals.baseDealId,
        );
        const baseDealId =
            Number.isFinite(numericBaseDealId) && numericBaseDealId > 0
                ? numericBaseDealId
                : null;

        const base: Omit<PresentationFlowJobData, 'kind'> = {
            domain: ctx.domain,
            operationId: ctx.dto.operationId,
            socketId,
            outcome: derivePresentationOutcome(ctx),
            isResult: ctx.isResult,
            isSpontaneous: ctx.isUnplannedPresentation,
            baseDealId,
            presDealId: Number(ctx.currentPresDeal?.ID) || null,
            companyId:
                ctx.entityType === EEventReportEntityType.COMPANY
                    ? ctx.entityId
                    : Number(ctx.company?.ID) || null,
            leadId: Number(ctx.lead?.ID) || null,
            contactId:
                Number(
                    ctx.dto.plan?.contact?.ID ?? ctx.dto.report?.contact?.ID,
                ) || null,
            responsibleId: ctx.planResponsibleId,
            taskId: Number(ctx.currentTask?.id) || null,
            planResponsibleId: ctx.planCreatedById || ctx.planResponsibleId,
            planDeadline: ctx.planDeadline?.toCrmDateTime() ?? null,
            planName: ctx.planEventName || null,
            planComment: ctx.reportComment || null,
            reportComment: ctx.reportComment || null,
            // Снимок анкеты — из УЖЕ загруженных сущностей контекста, без
            // единого лишнего вызова Bitrix (фрейм пишет анкету до отчёта).
            survey: buildPresentationSurveySnapshot({
                portal: ctx.portal,
                lead: ctx.lead as Record<string, unknown> | null,
                baseDeal: ctx.currentBaseDeal as Record<string, unknown> | null,
            }),
        };

        for (const kind of kinds) {
            await this.queue.dispatch(
                QueueNames.EVENT_SALES_PRESENTATION_FLOW,
                JobNames.EVENT_SALES_PRESENTATION_FLOW,
                { ...base, kind } satisfies PresentationFlowJobData,
                undefined,
                { removeOnComplete: true, removeOnFail: true },
            );
        }
    }

    /**
     * Гейт чек-листов задач (`task_checklist_enabled`, по умолчанию ВЫКЛ).
     *
     * Настройки недоступны — считаем выключенным: отчёт важнее чек-листа,
     * упавший сервис настроек не должен ни ронять отправку, ни включать
     * чек-листы неожиданно для владельца портала.
     */
    private async isTaskChecklistEnabled(domain: string): Promise<boolean> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return Boolean(settings.withTaskChecklist);
        } catch (error) {
            this.logger.warn(
                `настройки ${domain} недоступны — чек-листы задач выключены ` +
                    `(${(error as Error).message})`,
            );
            return false;
        }
    }

    /**
     * Определения полей-связей лида с портала: формат crm-значения зависит
     * от числа разрешённых типов (один → голый id, несколько → `D_123`).
     * Поле не установлено — не запрашиваем.
     */
    private async leadLinkDefinitions(
        domain: string,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<LeadUfDefinitions> {
        const names = [PBX_SALES_EVENT_FIELD_CODES.to_sale_deal]
            .map(code => {
                const field = portal.getEntityFieldByCode('lead', code);
                return field ? portal.getFieldBitrixId(field) : null;
            })
            .filter((name): name is string => !!name);
        return this.ufDefinitions.resolve(domain, bitrix, names);
    }
}
