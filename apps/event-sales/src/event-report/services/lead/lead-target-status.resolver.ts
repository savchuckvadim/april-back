import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';

/** Исход отчёта с точки зрения судьбы лида. */
export const ELeadStatusOutcome = {
    SUCCESS: 'success',
    FAIL: 'fail',
} as const;

export type LeadStatusOutcome =
    (typeof ELeadStatusOutcome)[keyof typeof ELeadStatusOutcome];

/**
 * Исход отчёта: та же логика, что исторически жила в lead-relation сервисе.
 * Чистая функция — переиспользуется и тестируется без Bitrix.
 */
export const getLeadStatusOutcome = (
    ctx: EventReportContext,
): LeadStatusOutcome | null => {
    if (ctx.isResult && (ctx.isInWork || ctx.isSuccessSale)) {
        return ELeadStatusOutcome.SUCCESS;
    }
    if (ctx.isFail) return ELeadStatusOutcome.FAIL;
    return null;
};

/**
 * Целевой STATUS_ID лида по исходу отчёта.
 *
 * Механизм под портальный маппинг готов, но сам маппинг «исход → стадия»
 * ещё не утверждён (см. front/docs/pbx-fields-system.md §8.2 — открытый
 * вопрос статусов лида). Когда набор целевых стадий согласуют, резолв
 * пойдёт по реестру стадий лида (`PbxLeadStageCode`,
 * libs/portal-lib/pbx/domain/src/portal-lead/stages) через слепок портала —
 * до тех пор возвращаем стандартные статусы Bitrix.
 */
export class LeadTargetStatusResolver {
    resolve(outcome: LeadStatusOutcome, portal: PortalModel): string | null {
        return (
            this.resolveFromPortal(outcome, portal) ??
            (outcome === ELeadStatusOutcome.SUCCESS ? 'CONVERTED' : 'JUNK')
        );
    }

    private resolveFromPortal(
        outcome: LeadStatusOutcome,
        portal: PortalModel,
    ): string | null {
        // TODO(lead-stages): резолв по реестру portal-lead-stages
        // (lead_taken_in_work / lead_company_work / зеркала lead_pres,
        // lead_warm) — как только целевые стадии для success/fail утверждены.
        void outcome;
        void portal;
        return null;
    }
}
