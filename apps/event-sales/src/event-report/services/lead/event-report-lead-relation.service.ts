import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import {
    getLeadStatusOutcome,
    LeadTargetStatusResolver,
} from './lead-target-status.resolver';

/**
 * Обновление статуса связанного лида в зависимости от результата (gsirk only).
 *
 * Исход считает {@link getLeadStatusOutcome}, целевой STATUS_ID —
 * {@link LeadTargetStatusResolver}: там же живёт точка расширения под
 * портальный реестр стадий лида. Пока маппинг не утверждён, работает только
 * gsirk со стандартными CONVERTED/JUNK — поведение не менялось.
 */
export class EventReportLeadRelationService {
    private readonly logger = new Logger(EventReportLeadRelationService.name);
    private readonly statusResolver = new LeadTargetStatusResolver();

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isGsirk) return;
        if (!ctx.lead?.ID) return;
        const leadId = Number(ctx.lead.ID);

        const outcome = getLeadStatusOutcome(ctx);
        if (!outcome) return;

        const statusId = this.statusResolver.resolve(outcome, this.portal);
        if (!statusId) return;

        this.bitrix.batch.lead.update(
            `update_lead_${outcome}_${leadId}`,
            leadId,
            { STATUS_ID: statusId },
        );
    }
}
