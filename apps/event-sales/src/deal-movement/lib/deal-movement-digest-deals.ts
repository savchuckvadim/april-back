import {
    DEAL_MOVEMENT_ALARM_STATUSES,
    dealMovementReasonTexts,
    isDealMovementAlarm,
    type DealMovementNightChange,
    type DealMovementNightDeal,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';

/**
 * Сделки ночи → строки сводки руководителям. Чистые функции: кто «новый за
 * ночь», порядок важности, первые под риском по сумме.
 */

/**
 * Оценённые сделки ночи и смены статуса → сделки сводки. «Новая за ночь» —
 * сделка, которая этой ночью сменила статус на тревожный («застряла»,
 * «откатилась», «под риском»), в том числе с одного тревожного на другой.
 */
export function buildDealMovementDigestDeals(
    deals: readonly DealMovementNightDeal[],
    changes: readonly DealMovementNightChange[],
): DealMovementDigestDeal[] {
    const newFrom = new Map<string, DealMovementStatus>();
    for (const change of changes) {
        if (isDealMovementAlarm(change.to)) {
            newFrom.set(change.dealId, change.from);
        }
    }
    return deals.map(deal => ({
        dealId: deal.verdict.dealId,
        title: deal.title,
        assignedById: deal.assignedById,
        amount: deal.amount,
        status: deal.verdict.status,
        newFrom: newFrom.get(deal.verdict.dealId) ?? null,
        reasons: dealMovementReasonTexts(deal.verdict).join('; '),
        daysInStage: deal.verdict.facts.daysInStage,
    }));
}

/** Важность тревожного статуса: откатилась, застряла, под риском. */
const severityOf = (status: DealMovementStatus): number => {
    const index = (
        DEAL_MOVEMENT_ALARM_STATUSES as readonly DealMovementStatus[]
    ).indexOf(status);
    return index === -1 ? DEAL_MOVEMENT_ALARM_STATUSES.length : index;
};

const amountOf = (deal: DealMovementDigestDeal): number => deal.amount ?? 0;

/** «Новые за ночь»: важные статусы первыми, внутри — по сумме. */
export function newDealMovementDigestDeals(
    deals: readonly DealMovementDigestDeal[],
): DealMovementDigestDeal[] {
    return deals
        .filter(
            deal => deal.newFrom !== null && isDealMovementAlarm(deal.status),
        )
        .sort(
            (a, b) =>
                severityOf(a.status) - severityOf(b.status) ||
                amountOf(b) - amountOf(a) ||
                Number(a.dealId) - Number(b.dealId),
        );
}

/**
 * «Под риском — первые N по сумме»: при равной сумме — у кого больше дней
 * в стадии. Сделки из «Новых за ночь» не повторяются.
 */
export function topAtRiskDealMovementDigestDeals(
    deals: readonly DealMovementDigestDeal[],
    top: number,
    shownAsNew: ReadonlySet<string>,
): DealMovementDigestDeal[] {
    return deals
        .filter(
            deal => deal.status === 'at_risk' && !shownAsNew.has(deal.dealId),
        )
        .sort(
            (a, b) =>
                amountOf(b) - amountOf(a) ||
                b.daysInStage - a.daysInStage ||
                Number(a.dealId) - Number(b.dealId),
        )
        .slice(0, Math.max(0, top));
}
