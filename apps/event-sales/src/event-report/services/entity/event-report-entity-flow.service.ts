import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from './event-report-entity-fields.model';
import { EventReportCompanyBackfillModel } from './event-report-company-backfill.model';
import { EEventReportEntityType } from '../init/event-report-init.types';

/**
 * Ставит в batch одну команду `update` сущности-владельца (company / lead /
 * сделка без компании) с уже собранными UF_CRM_*-полями из
 * {@link EventReportEntityFieldsModel}.
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
        this.queueCompanyBackfill(ctx);
        if (!ctx.entityId) {
            this.logger.warn('entity-flow: skipped — no entityId');
            return;
        }
        if (ctx.entityType === EEventReportEntityType.COMPANY && !ctx.company) {
            this.logger.warn('entity-flow: company entity not loaded');
            return;
        }
        if (ctx.entityType === EEventReportEntityType.LEAD && !ctx.lead) {
            this.logger.warn('entity-flow: lead entity not loaded');
            return;
        }
        if (ctx.entityType === EEventReportEntityType.DEAL && !ctx.ownerDeal) {
            this.logger.warn('entity-flow: owner deal not loaded');
            return;
        }

        const model = new EventReportEntityFieldsModel(
            this.portal,
            ctx,
            ctx.entityType,
            // Владелец-сделка читает свои текущие multiple-поля из себя же;
            // роль base — это «корневая» сделка контекста.
            ctx.entityType === EEventReportEntityType.DEAL
                ? {
                      deal: ctx.ownerDeal as Record<string, unknown> | null,
                      role: EDealRole.BASE,
                  }
                : null,
        );
        const fields = model.toFields();
        if (Object.keys(fields).length === 0) {
            return;
        }

        const cmd = `update_entity_${ctx.entityType}_${ctx.entityId}`;
        // UF_CRM_* поля динамические по порталу — типы IBXCompany/IBXLead их
        // не описывают, поэтому маппинг приводится к unknown.
        if (ctx.entityType === EEventReportEntityType.COMPANY) {
            this.bitrix.batch.company.update(
                cmd,
                ctx.entityId,
                fields as unknown as Parameters<
                    typeof this.bitrix.batch.company.update
                >[2],
            );
        } else if (ctx.entityType === EEventReportEntityType.DEAL) {
            this.bitrix.batch.deal.update(
                cmd,
                ctx.entityId,
                fields as unknown as Parameters<
                    typeof this.bitrix.batch.deal.update
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

    /**
     * Автозаполнение пустых РУЧНЫХ полей компании с базовой сделки (вопрос
     * владельца №6: работали со сделкой без компании, потом привязали
     * компанию — её поля пусты, а данные уже собраны на сделке).
     * Отдельная batch-команда: она не зависит от того, кто владелец отчёта,
     * и не смешивается с основным update сущности.
     */
    private queueCompanyBackfill(ctx: EventReportContext): void {
        const company = ctx.company as Record<string, unknown> | null;
        const deal = ctx.currentBaseDeal as Record<string, unknown> | null;
        if (!company || !deal) return;
        const companyId = Number(company.ID);
        if (!Number.isFinite(companyId) || companyId <= 0) return;

        const fields = new EventReportCompanyBackfillModel(
            this.portal,
            company,
            deal,
        ).toFields();
        if (!Object.keys(fields).length) return;

        this.logger.log(
            `entity-flow: бэкфилл компании ${companyId} со сделки ` +
                `${deal.ID}: ${Object.keys(fields).join(', ')}`,
        );
        this.bitrix.batch.company.update(
            `backfill_company_${companyId}`,
            companyId,
            fields as unknown as Parameters<
                typeof this.bitrix.batch.company.update
            >[2],
        );
    }
}
