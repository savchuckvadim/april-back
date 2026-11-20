import {
    DEAL_MOVEMENT_ALARM_STATUSES,
    dealMovementReasonTexts,
    dueDealMovementReminder,
    isDealMovementAlarm,
    isDealMovementWorsened,
    type DealMovementNightChange,
    type DealMovementNightDeal,
    type DealMovementStateEntry,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';

/**
 * Сделки ночи → строки сводок руководителям. Чистые функции: кто «новая
 * проблема», порядок важности, списки по сумме, напоминания по ступеням.
 */

/**
 * Оценённые сделки ночи, смены статуса и новое состояние → сделки сводки.
 * «Новая проблема» (решение владельца 20.11.2026) — переход из «Движется»
 * в любой проблемный статус или ухудшение («Без продвижения» → «Под
 * риском» / «Без внимания», любой → «Вернулась назад»); улучшение — нет.
 * Ступень напоминания — по сроку стадии и последней напомненной ступени
 * из состояния.
 */
export function buildDealMovementDigestDeals(
    deals: readonly DealMovementNightDeal[],
    changes: readonly DealMovementNightChange[],
    state: ReadonlyMap<string, DealMovementStateEntry>,
): DealMovementDigestDeal[] {
    const newFrom = new Map<string, DealMovementStatus>();
    for (const change of changes) {
        if (isDealMovementWorsened(change.from, change.to)) {
            newFrom.set(change.dealId, change.from);
        }
    }
    return deals.map(deal => {
        const { dealId, status, facts } = deal.verdict;
        const entry = state.get(dealId);
        return {
            dealId,
            title: deal.title,
            assignedById: deal.assignedById,
            amount: deal.amount,
            status,
            newFrom: newFrom.get(dealId) ?? null,
            reasons: dealMovementReasonTexts(deal.verdict).join('; '),
            daysInStage: facts.daysInStage,
            limit: {
                stageLimitDays: facts.stageLimitDays,
                stageLimitSource: facts.stageLimitSource,
            },
            changedAt: entry?.changedAt ?? null,
            remindStep: dueDealMovementReminder(
                status,
                facts,
                entry?.remindedStep ?? 0,
            ),
            // Находку аудита добавляет сама рассылка (читает хранилище аудита).
            audit: null,
        };
    });
}

/**
 * Пометки аудита к сделкам сводки: сделка с пометкой — с ней, без — как
 * была. Статус и порядок не меняются.
 */
export function withDealAuditNotes(
    deals: readonly DealMovementDigestDeal[],
    notes: ReadonlyMap<string, string>,
): DealMovementDigestDeal[] {
    return deals.map(deal => ({
        ...deal,
        audit: notes.get(deal.dealId) ?? null,
    }));
}

/** Важность тревожного статуса — порядок правил. */
const severityOf = (status: DealMovementStatus): number => {
    const index = (
        DEAL_MOVEMENT_ALARM_STATUSES as readonly DealMovementStatus[]
    ).indexOf(status);
    return index === -1 ? DEAL_MOVEMENT_ALARM_STATUSES.length : index;
};

const amountOf = (deal: DealMovementDigestDeal): number => deal.amount ?? 0;

/** По сумме, при равной — дольше в стадии, затем по номеру сделки. */
const byAmount = (
    a: DealMovementDigestDeal,
    b: DealMovementDigestDeal,
): number =>
    amountOf(b) - amountOf(a) ||
    b.daysInStage - a.daysInStage ||
    Number(a.dealId) - Number(b.dealId);

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

/** Первые N по сумме среди сделок, прошедших фильтр. */
export function topDealMovementDigestDeals(
    deals: readonly DealMovementDigestDeal[],
    top: number,
    keep: (deal: DealMovementDigestDeal) => boolean,
): DealMovementDigestDeal[] {
    return deals.filter(keep).sort(byAmount).slice(0, Math.max(0, top));
}

/**
 * «Под риском — первые N по сумме»: при равной сумме — у кого больше дней
 * в стадии. Сделки из «Новых за ночь» не повторяются.
 */
export const topAtRiskDealMovementDigestDeals = (
    deals: readonly DealMovementDigestDeal[],
    top: number,
    shownAsNew: ReadonlySet<string>,
): DealMovementDigestDeal[] =>
    topDealMovementDigestDeals(
        deals,
        top,
        deal => deal.status === 'at_risk' && !shownAsNew.has(deal.dealId),
    );

/** Статус сменился после момента (ISO); момента нет — не сменился. */
export const changedSince = (
    deal: DealMovementDigestDeal,
    sinceMs: number,
): boolean => {
    if (deal.changedAt === null) return false;
    const atMs = Date.parse(deal.changedAt);
    return !Number.isNaN(atMs) && atMs > sinceMs;
};
