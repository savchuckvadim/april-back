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
 * Точки истории → переходы по сделкам: соседние точки одной сделки (по
 * времени, при равенстве — по id записи) дают переход «с ступени на
 * ступень». Повтор одной записи (пересечение страниц) схлопывается.
 */
export function transitionsByDeal(
    points: readonly DealMovementHistoryPoint[],
): Map<number, DealMovementTransition[]> {
    const byDeal = new Map<number, DealMovementHistoryPoint[]>();
    const seen = new Set<number>();
    for (const point of points) {
        if (seen.has(point.id)) continue;
        seen.add(point.id);
        const list = byDeal.get(point.dealId) ?? [];
        list.push(point);
        byDeal.set(point.dealId, list);
    }
    const result = new Map<number, DealMovementTransition[]>();
    for (const [dealId, list] of byDeal) {
        const sorted = [...list].sort(
            (a, b) => a.at.localeCompare(b.at) || a.id - b.id,
        );
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
