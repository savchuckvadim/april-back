import { ETimeZone, parseBitrixField } from '@lib/shared/lib/date';
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
import type { DealMovementDealRow } from '../types/deal-movement.types';
import {
    resolveSalesBaseStage,
    type SalesBaseStageLookup,
} from './deal-movement-stages';

/** Положительный id; ноль, пусто и мусор — null. */
export const toPositiveId = (raw: unknown): number | null => {
    const value = Number(scalarText(raw));
    return Number.isInteger(value) && value > 0 ? value : null;
};

/** Сумма сделки; пусто и не число — null (ноль остаётся нулём). */
const toAmount = (raw: unknown): number | null => {
    const text = scalarText(raw).trim();
    if (!text) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
};

/** Момент Битрикса → ISO (UTC); пусто и мусор — null. */
const toIso = (raw: unknown, timezone: ETimeZone): string | null =>
    parseBitrixField(raw, timezone)?.toISOString() ?? null;

/**
 * Строка `crm.deal.list` → сделка в объёме правил. Формат Битрикса (строки,
 * даты без пояса, STAGE_ID с префиксом воронки) дальше этой функции не
 * уходит. Без id — null: такую строку не оценить и не запомнить.
 */
export function toDealMovementRow(
    raw: Readonly<Record<string, unknown>>,
    stages: SalesBaseStageLookup,
    timezone: ETimeZone,
): DealMovementDealRow | null {
    const dealId = toPositiveId(raw['ID']);
    if (dealId === null) return null;
    const stage = resolveSalesBaseStage(raw['STAGE_ID'], stages);
    return {
        dealId,
        title: scalarText(raw['TITLE']).trim() || `Сделка #${dealId}`,
        stageCode: stage?.code ?? null,
        stageOrder: stage?.order ?? null,
        assignedById: toPositiveId(raw['ASSIGNED_BY_ID']),
        amount: toAmount(raw['OPPORTUNITY']),
        companyId: toPositiveId(raw['COMPANY_ID']),
        contactId: toPositiveId(raw['CONTACT_ID']),
        leadId: toPositiveId(raw['LEAD_ID']),
        movedAt: toIso(raw['MOVED_TIME'], timezone),
        lastActivityAt: toIso(raw['LAST_ACTIVITY_TIME'], timezone),
        createdAt: toIso(raw['DATE_CREATE'], timezone),
    };
}
