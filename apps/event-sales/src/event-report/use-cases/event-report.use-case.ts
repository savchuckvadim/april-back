import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventReportInitService } from '../services/init/event-report-init.service';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportEntityFlowService } from '../services/entity/event-report-entity-flow.service';
import { EventReportDealFlowService } from '../services/deal/event-report-deal-flow.service';
import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { EventReportKpiFlowService } from '../services/kpi-list/event-report-kpi-flow.service';
import { EventReportPresentationListService } from '../services/kpi-list/event-report-presentation-list.service';
import { EventReportPostFailService } from '../services/post-fail/event-report-post-fail.service';
import { EventReportLeadRelationService } from '../services/lead/event-report-lead-relation.service';
import { EventReportReturnToTmcService } from '../services/return-to-tmc/event-report-return-to-tmc.service';
import { EventReportEntityHistoryService } from '../services/history/event-report-entity-history.service';
import { ColdHookBatchGroupBuffer } from '../../cold-hook/services/batch/cold-hook-batch-group-buffer';

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
    ) {}

    async execute(dto: EventSalesFlowDto): Promise<{
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
        const taskFlow = new EventReportTaskFlowService(bitrix, portal);
        const kpiFlow = new EventReportKpiFlowService(bitrix, portal);
        const presentationList = new EventReportPresentationListService(
            bitrix,
            portal,
        );
        const postFail = new EventReportPostFailService(bitrix, portal);
        const leadRelation = new EventReportLeadRelationService(bitrix, portal);
        const returnToTmc = new EventReportReturnToTmcService(bitrix, portal);
        const history = new EventReportEntityHistoryService(bitrix, portal);

        // KPI использует тот же ColdHookBatchGroupBuffer (контракт KpiListFlowService).
        // По факту мы тут одна группа = весь endpoint; вся работа упадёт в один HTTP.
        const buffer = new ColdHookBatchGroupBuffer(bitrix);

        entityFlow.queue(ctx);
        const deals = dealFlow.queue(ctx);
        taskFlow.queue(ctx, deals);
        kpiFlow.queue(ctx, deals, buffer);
        presentationList.queue(ctx, deals);
        postFail.queue(ctx);
        leadRelation.queue(ctx);
        returnToTmc.queue(ctx);
        history.queue(ctx);

        // Коммитим KPI группу + flush'им буфер. Также отправляем всё, что
        // напрямую закинули в bitrix.batch.* (entity/deal/task/etc.).
        await buffer.endGroup();
        await buffer.flush();
        const results = await bitrix.api.callBatchWithConcurrency(1);

        const commandsCount =
            results.reduce(
                (sum, chunk) => sum + Object.keys(chunk.result ?? {}).length,
                0,
            ) + buffer.getResults().length;

        this.logger.log(
            `event-report executed: entity=${ctx.entityType}:${ctx.entityId}, commands=${commandsCount}`,
        );
        return {
            success: true,
            commandsCount,
            entityType: ctx.entityType,
            entityId: ctx.entityId,
        };
    }
}
