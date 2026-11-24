import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import {
    KPI_LIST_FLOW_SCOPE,
    KpiListFlowService,
} from '../../../shared/kpi-list-flow/services/kpi-list-flow.service';
import { EventDocumentContext } from '../context/event-document.context';
import { EventDocumentKpiPayloadBuilder } from './event-document-kpi-payload.builder';

/**
 * Запись документов в «ОП KPI» и «ОП История» общим `KpiListFlowService` —
 * тем же, которым пишет отчёт о звонке.
 */
export class EventDocumentKpiFlowService {
    private readonly lists: KpiListFlowService;

    constructor(bitrix: BitrixService, portal: PortalModel) {
        this.lists = new KpiListFlowService(bitrix, portal);
    }

    async queue(
        ctx: EventDocumentContext,
        buffer: IBatchGroupBuffer,
    ): Promise<void> {
        const rows = new EventDocumentKpiPayloadBuilder(ctx).build();
        for (const payload of rows.history) {
            this.lists.flow(payload, ctx.companyId, buffer, {
                scope: KPI_LIST_FLOW_SCOPE.history,
                requireEventTypeItem: true,
            });
        }
        // Наличие строки KPI проверяется чтением по коду — по одной.
        for (const payload of rows.kpi) {
            await this.lists.flowDedup(payload, buffer);
        }
    }
}
