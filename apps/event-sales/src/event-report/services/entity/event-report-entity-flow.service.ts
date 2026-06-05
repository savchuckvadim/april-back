import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import { EventReportEntityFieldsModel } from './event-report-entity-fields.model';

/**
 * Ставит в batch одну команду `update` (company или lead) с уже собранными
 * UF_CRM_*-полями из {@link EventReportEntityFieldsModel}.
 *
 * Не @Injectable — создаётся через `new` рядом с конкретным {@link BitrixService}
 * (см. CLAUDE.md, race condition).
 */
export class EventReportEntityFlowService {
    private readonly logger = new Logger(EventReportEntityFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.entityId) {
            this.logger.warn('entity-flow: skipped — no entityId');
            return;
        }
        if (ctx.entityType === 'company' && !ctx.company) {
            this.logger.warn('entity-flow: company entity not loaded');
            return;
        }
        if (ctx.entityType === 'lead' && !ctx.lead) {
            this.logger.warn('entity-flow: lead entity not loaded');
            return;
        }

        const model = new EventReportEntityFieldsModel(
            this.portal,
            ctx,
            ctx.entityType,
        );
        const fields = model.toFields();
        if (Object.keys(fields).length === 0) {
            return;
        }

        const cmd = `update_entity_${ctx.entityType}_${ctx.entityId}`;
        // UF_CRM_* поля динамические по порталу — типы IBXCompany/IBXLead их
        // не описывают, поэтому маппинг приводится к unknown.
        if (ctx.entityType === 'company') {
            this.bitrix.batch.company.update(
                cmd,
                ctx.entityId,
                fields as unknown as Parameters<
                    typeof this.bitrix.batch.company.update
                >[2],
            );
        } else {
            this.bitrix.batch.lead.update(
                cmd,
                ctx.entityId,
                fields as unknown as Parameters<
                    typeof this.bitrix.batch.lead.update
                >[2],
            );
        }
    }
}
