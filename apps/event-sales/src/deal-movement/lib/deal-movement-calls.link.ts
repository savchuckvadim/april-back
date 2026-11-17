import { BitrixEntityType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import type { DealMovementCall } from '@lib/sales-ai-analytics';
import type {
    DealMovementCallRef,
    DealMovementDealRow,
} from '../types/deal-movement.types';

/** Связь «значение → открытые сделки» одного вида (лид, компания, контакт). */
type DealsBy = ReadonlyMap<number, readonly number[]>;

export interface DealMovementDealIndex {
    readonly open: ReadonlySet<number>;
    readonly byLead: DealsBy;
    readonly byCompany: DealsBy;
    readonly byContact: DealsBy;
}

const groupBy = (
    deals: readonly DealMovementDealRow[],
    key: (deal: DealMovementDealRow) => number | null,
): Map<number, number[]> => {
    const result = new Map<number, number[]>();
    for (const deal of deals) {
        const value = key(deal);
        if (value === null) continue;
        const list = result.get(value) ?? [];
        list.push(deal.dealId);
        result.set(value, list);
    }
    return result;
};

/** Индекс открытых сделок по связям — строится один раз на прогон. */
export const indexOpenDeals = (
    deals: readonly DealMovementDealRow[],
): DealMovementDealIndex => ({
    open: new Set(deals.map(deal => deal.dealId)),
    byLead: groupBy(deals, deal => deal.leadId),
    byCompany: groupBy(deals, deal => deal.companyId),
    byContact: groupBy(deals, deal => deal.contactId),
});

/** Ровно одна открытая сделка у значения — иначе сцеплять не с чем. */
const single = (by: DealsBy, id: number | null): number | null => {
    if (id === null) return null;
    const deals = by.get(id);
    return deals?.length === 1 ? deals[0] : null;
};

/**
 * Сделка звонка — пять путей по порядку (решение 17.11.2026):
 * 1. основная сделка по разбору (`relatedDeals.mainDealId`), если открыта;
 * 2. звонок записан на саму открытую сделку;
 * 3. звонок по лиду, из которого сделка (`LEAD_ID`);
 * 4. звонок по компании, у которой ровно одна открытая сделка;
 * 5. звонок по контакту — основному контакту ровно одной открытой сделки.
 * Неоднозначность (у компании две открытые сделки) — звонок не сцеплен:
 * лучше без звонка, чем чужой звонок в досье.
 */
export function dealOfCall(
    ref: DealMovementCallRef,
    index: DealMovementDealIndex,
): number | null {
    if (ref.mainDealId !== null && index.open.has(ref.mainDealId)) {
        return ref.mainDealId;
    }
    const entityId = ref.entityId;
    switch (ref.entityType) {
        case BitrixEntityType.DEAL:
            return entityId !== null && index.open.has(entityId)
                ? entityId
                : null;
        case BitrixEntityType.LEAD:
            return single(index.byLead, entityId);
        case BitrixEntityType.COMPANY:
            return single(index.byCompany, entityId);
        case BitrixEntityType.CONTACT:
            return single(index.byContact, entityId);
        default:
            return null;
    }
}

/** Разобранные звонки → звонки по открытым сделкам. */
export function linkCallsToDeals(
    refs: readonly DealMovementCallRef[],
    index: DealMovementDealIndex,
): Map<number, DealMovementCall[]> {
    const result = new Map<number, DealMovementCall[]>();
    for (const ref of refs) {
        const dealId = dealOfCall(ref, index);
        if (dealId === null) continue;
        const list = result.get(dealId) ?? [];
        list.push(ref.call);
        result.set(dealId, list);
    }
    return result;
}

/**
 * Звонок может относиться к одной из сделок: по связям, которые знает
 * список открытых сделок, или записан на сделку (основная по разбору
 * проверяется после чтения разбора). Нужен, чтобы не читать разборы
 * заведомо чужих звонков.
 */
export function mayBelongToDeals(
    entityType: string | null,
    entityId: number | null,
    index: DealMovementDealIndex,
): boolean {
    if (entityId === null) return false;
    switch (entityType) {
        case BitrixEntityType.DEAL:
            // Сделка другой воронки тоже: разбор мог назвать основную.
            return true;
        case BitrixEntityType.LEAD:
            return index.byLead.has(entityId);
        case BitrixEntityType.COMPANY:
            return index.byCompany.has(entityId);
        case BitrixEntityType.CONTACT:
            return index.byContact.has(entityId);
        default:
            return false;
    }
}
