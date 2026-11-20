import type { IBXStageHistoryItem } from '@lib/bitrix/domain/crm/stage-history';
import type { DealMovementTransition } from '@lib/sales-ai-analytics';
import type { DealMovementHistoryPoint } from '../types/deal-movement.types';
import { toPositiveId } from './deal-movement-deal-row';
import {
    resolveSalesBaseStage,
    type SalesBaseStageLookup,
} from './deal-movement-stages';

/**
 * Записи `crm.stagehistory.list` → точки «сделка встала на ступень». Записи
 * без сделки, без момента и со стадиями вне лестницы (чужая воронка,
 * удалённая стадия) отбрасываются: у них нет порядка.
 */
export function toHistoryPoints(
    items: readonly IBXStageHistoryItem[],
    stages: SalesBaseStageLookup,
): DealMovementHistoryPoint[] {
    const points: DealMovementHistoryPoint[] = [];
    for (const item of items) {
        const dealId = toPositiveId(item.OWNER_ID);
        const id = toPositiveId(item.ID);
        const stage = resolveSalesBaseStage(item.STAGE_ID, stages);
        const atMs = Date.parse(String(item.CREATED_TIME ?? ''));
        if (dealId === null || id === null || !stage || Number.isNaN(atMs)) {
            continue;
        }
        points.push({
            id,
            dealId,
            order: stage.order,
            at: new Date(atMs).toISOString(),
        });
    }
    return points;
}

/**
 * Точки истории по сделкам: по времени (при равенстве — по id записи),
 * повтор одной записи (пересечение страниц) схлопывается.
 */
export function historyPointsByDeal(
    points: readonly DealMovementHistoryPoint[],
): Map<number, DealMovementHistoryPoint[]> {
    const byDeal = new Map<number, DealMovementHistoryPoint[]>();
    const seen = new Set<number>();
    for (const point of points) {
        if (seen.has(point.id)) continue;
        seen.add(point.id);
        const list = byDeal.get(point.dealId) ?? [];
        list.push(point);
        byDeal.set(point.dealId, list);
    }
    for (const list of byDeal.values()) {
        list.sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
    }
    return byDeal;
}

/**
 * Точки истории → переходы по сделкам: соседние точки одной сделки дают
 * переход «с ступени на ступень».
 */
export function transitionsByDeal(
    byDeal: ReadonlyMap<number, readonly DealMovementHistoryPoint[]>,
): Map<number, DealMovementTransition[]> {
    const result = new Map<number, DealMovementTransition[]>();
    for (const [dealId, sorted] of byDeal) {
        const transitions: DealMovementTransition[] = [];
        for (let index = 1; index < sorted.length; index++) {
            transitions.push({
                at: sorted[index].at,
                fromOrder: sorted[index - 1].order,
                toOrder: sorted[index].order,
            });
        }
        result.set(dealId, transitions);
    }
    return result;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Закрытые эпизоды стадий: сколько дней сделка простояла на ступени до
 * ухода с неё (соседние точки одной ступени — один эпизод). Открытый
 * эпизод (текущая стадия) длительности не имеет и не считается — как у
 * фактов сроков AI-аналитики (`stageSlaFacts`). Ступень → дни эпизодов.
 */
export function stageDwellDays(
    byDeal: ReadonlyMap<number, readonly DealMovementHistoryPoint[]>,
): Map<number, number[]> {
    const dwell = new Map<number, number[]>();
    for (const sorted of byDeal.values()) {
        let start: DealMovementHistoryPoint | null = null;
        for (const point of sorted) {
            if (start !== null && point.order === start.order) continue;
            if (start !== null) {
                const days =
                    (Date.parse(point.at) - Date.parse(start.at)) / DAY_MS;
                if (Number.isFinite(days) && days >= 0) {
                    const list = dwell.get(start.order) ?? [];
                    list.push(days);
                    dwell.set(start.order, list);
                }
            }
            start = point;
        }
    }
    return dwell;
}
