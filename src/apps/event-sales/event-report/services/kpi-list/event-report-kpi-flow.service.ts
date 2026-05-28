import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { KpiListFlowService } from '../../../shared/kpi-list-flow/services/kpi-list-flow.service';
import { EventReportContext } from '../context/event-report.context';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';
import { EventReportKpiPayloadBuilder } from './event-report-kpi-payload.builder';
import { ColdHookBatchGroupBuffer } from '../../../cold-hook/services/batch/cold-hook-batch-group-buffer';

/**
 * Создаёт KPI/History элементы для всех применимых сценариев event-report.
 *
 * Реюзает {@link KpiListFlowService} из shared — он уже создаёт элементы
 * в `sales_kpi` и `sales_history` списках. Для буфера используем
 * {@link ColdHookBatchGroupBuffer} с одной группой; в event-report endpoint
 * по факту вся работа уйдёт одним batch (≤50 команд), но контракт буфера
 * сохраняем — он гарантирует целостность $result[...] ссылок.
 */
export class EventReportKpiFlowService {
    private readonly logger = new Logger(EventReportKpiFlowService.name);
    private readonly kpiFlow: KpiListFlowService;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {
        this.kpiFlow = new KpiListFlowService(bitrix, portal);
    }

    queue(
        ctx: EventReportContext,
        deals: DealFlowResult,
        buffer: ColdHookBatchGroupBuffer,
    ): void {
        if (ctx.isNoCall) return;

        const builder = new EventReportKpiPayloadBuilder(
            this.portal,
            ctx,
            deals,
        );
        const payloads = builder.buildAll();
        if (payloads.length === 0) {
            return;
        }
        for (const payload of payloads) {
            this.kpiFlow.flow(payload, ctx.entityId, buffer);
        }
    }
}
