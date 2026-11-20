import {
    DEAL_MOVEMENT_CALC_VERSION,
    DEAL_MOVEMENT_DEALS_FORM,
    DEAL_MOVEMENT_DEALS_PER_GROUP,
    dealMovementReasonTexts,
    emptyDealMovementStatusSums,
    isDealMovementAlarm,
    type DealMovementAlarmStatus,
    type DealMovementDealsSnapshotPayload,
    type DealMovementNightDeal,
    type DealMovementProblemDeal,
    type DealMovementProblemGroup,
    type DealMovementStateEntry,
    type DealMovementStatusSums,
} from '@lib/sales-ai-analytics';

/**
 * Записи ночи для витрины «Движение сделок» (20.11.2026): счёт и сумма по
 * статусам — всего и по ответственным, список проблемных сделок по
 * ответственному и статусу. Чистые функции.
 */

/** Счёт и сумма по статусам: всего и по ответственным. */
export interface DealMovementStatusSumsByManager {
    readonly totals: DealMovementStatusSums;
    /** Ответственный (Bitrix-id строкой) → счёт и сумма; без ответственного — только в итоге. */
    readonly byManager: Record<string, DealMovementStatusSums>;
}

const isAlarmStatus = (
    status: DealMovementNightDeal['verdict']['status'],
): status is DealMovementAlarmStatus => isDealMovementAlarm(status);

const amountOf = (deal: { amount: number | null }): number =>
    typeof deal.amount === 'number' && Number.isFinite(deal.amount)
        ? deal.amount
        : 0;

/** Оценённые сделки ночи → счёт и сумма по статусам, всего и по ответственным. */
export function dealMovementStatusSums(
    deals: readonly DealMovementNightDeal[],
): DealMovementStatusSumsByManager {
    const totals = emptyDealMovementStatusSums();
    const byManager: Record<string, DealMovementStatusSums> = {};
    for (const deal of deals) {
        const { status } = deal.verdict;
        const amount = amountOf(deal);
        totals[status].count += 1;
        totals[status].amountSum += amount;
        if (deal.assignedById === null) continue;
        const key = String(deal.assignedById);
        const sums = (byManager[key] ??= emptyDealMovementStatusSums());
        sums[status].count += 1;
        sums[status].amountSum += amount;
    }
    return { totals, byManager };
}

/** По сумме, при равной — дольше в стадии, затем по номеру сделки. */
const byAmount = (
    a: DealMovementProblemDeal,
    b: DealMovementProblemDeal,
): number =>
    amountOf(b) - amountOf(a) ||
    b.daysInStage - a.daysInStage ||
    Number(a.dealId) - Number(b.dealId);

function problemDealOf(
    deal: DealMovementNightDeal,
    status: DealMovementAlarmStatus,
    entry: DealMovementStateEntry | undefined,
    stageTitles: ReadonlyMap<string, string>,
): DealMovementProblemDeal {
    const { facts } = deal.verdict;
    return {
        dealId: deal.verdict.dealId,
        managerId:
            deal.assignedById === null ? null : String(deal.assignedById),
        status,
        title: deal.title,
        amount: deal.amount,
        stageCode: deal.stageCode,
        stageTitle:
            deal.stageCode === null
                ? null
                : (stageTitles.get(deal.stageCode) ?? null),
        daysInStage: facts.daysInStage,
        stageLimitDays: facts.stageLimitDays,
        stageLimitSource: facts.stageLimitSource,
        reasons: dealMovementReasonTexts(deal.verdict).join('; '),
        since: entry?.changedAt ?? null,
    };
}

export interface DealMovementProblemDealsInput {
    readonly deals: readonly DealMovementNightDeal[];
    /** Новое состояние ночи: с какой ночи сделка в статусе. */
    readonly state: ReadonlyMap<string, DealMovementStateEntry>;
    readonly stageTitles: ReadonlyMap<string, string>;
    /** День портала 'YYYY-MM-DD'. */
    readonly day: string;
    readonly generatedAt: string;
    readonly perGroup?: number;
}

/**
 * Проблемные сделки ночи по ответственному и тревожному статусу: в каждой
 * группе — не больше `perGroup` самых крупных по сумме, сколько всего —
 * в `groups`. Порядок групп и строк детерминирован.
 */
export function buildDealMovementProblemDeals(
    input: DealMovementProblemDealsInput,
): DealMovementDealsSnapshotPayload {
    const perGroup = Math.max(
        0,
        Math.floor(input.perGroup ?? DEAL_MOVEMENT_DEALS_PER_GROUP),
    );
    const grouped = new Map<string, DealMovementProblemDeal[]>();
    for (const deal of input.deals) {
        const status = deal.verdict.status;
        if (!isAlarmStatus(status)) continue;
        const row = problemDealOf(
            deal,
            status,
            input.state.get(deal.verdict.dealId),
            input.stageTitles,
        );
        const key = `${row.managerId ?? ''}|${row.status}`;
        const list = grouped.get(key) ?? [];
        list.push(row);
        grouped.set(key, list);
    }
    const groups: DealMovementProblemGroup[] = [];
    const deals: DealMovementProblemDeal[] = [];
    for (const key of [...grouped.keys()].sort()) {
        const rows = (grouped.get(key) ?? []).sort(byAmount);
        const shown = rows.slice(0, perGroup);
        groups.push({
            managerId: rows[0].managerId,
            status: rows[0].status,
            total: rows.length,
            shown: shown.length,
        });
        deals.push(...shown);
    }
    return {
        form: DEAL_MOVEMENT_DEALS_FORM,
        day: input.day,
        generatedAt: input.generatedAt,
        calcVersion: DEAL_MOVEMENT_CALC_VERSION,
        perGroup,
        groups,
        deals,
    };
}
