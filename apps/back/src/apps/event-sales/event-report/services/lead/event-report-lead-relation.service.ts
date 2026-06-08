import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';

/**
 * Обновление статуса связанного лида в зависимости от результата (gsirk only).
 *
 * Логика:
 *  - `isResult && (isInWork || isSuccessSale)` → лид переходит в success-статус;
 *  - `isFail` → лид переходит в fail-статус.
 *
 * STATUS_ID коды берём из портального конфига (если есть метод-резолвер) —
 * пока используем стандартные `CONVERTED` и `JUNK`.
 */
export class EventReportLeadRelationService {
    private readonly logger = new Logger(EventReportLeadRelationService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isGsirk) return;
        if (!ctx.lead?.ID) return;
        const leadId = Number(ctx.lead.ID);

        if (ctx.isResult && (ctx.isInWork || ctx.isSuccessSale)) {
            this.bitrix.batch.lead.update(
                `update_lead_success_${leadId}`,
                leadId,
                { STATUS_ID: 'CONVERTED' },
            );
            return;
        }
        if (ctx.isFail) {
            this.bitrix.batch.lead.update(
                `update_lead_fail_${leadId}`,
                leadId,
                { STATUS_ID: 'JUNK' },
            );
        }
        void this.portal;
    }
}
