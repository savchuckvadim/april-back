import type {
    DealMovementCall,
    DealMovementDossier,
    DealMovementNightDeal,
    DealMovementTransition,
    DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import type { DealMovementDealRow } from '../types/deal-movement.types';

/**
 * Сделка, её переходы и разобранные звонки → досье правил статуса.
 *
 * Что в этой волне сознательно пусто (решение 17.11.2026):
 * - срок стадии портала (p90) и вероятность продажи (θ) — null: «застряла»
 *   по порогу из настройки, правило по θ выключено;
 * - признак аудита сделок — null;
 * - задачи и дела Битрикса не читаются: контактом после договорённости
 *   считается разобранный звонок или ЛЮБАЯ активность по сделке позже её
 *   даты — поэтому последняя активность кладётся в `closedActivitiesAt`.
 */
export function buildDealMovementDossier(
    row: DealMovementDealRow,
    transitions: readonly DealMovementTransition[],
    calls: readonly DealMovementCall[],
): DealMovementDossier {
    return {
        dealId: String(row.dealId),
        // MOVED_TIME пуст у старых сделок — тогда отсчёт от создания.
        stageEnteredAt: row.movedAt ?? row.createdAt ?? '',
        stageOrder: row.stageOrder,
        lastActivityAt: row.lastActivityAt,
        transitions,
        stageNormDays: null,
        stageChance: null,
        amount: row.amount,
        calls,
        closedActivitiesAt: row.lastActivityAt ? [row.lastActivityAt] : [],
        forgotten: null,
    };
}

/** Сделка и её вердикт → вход плана ночи. */
export function toNightDeal(
    row: DealMovementDealRow,
    verdict: DealMovementVerdict,
): DealMovementNightDeal {
    return {
        verdict,
        title: row.title,
        stageCode: row.stageCode,
        amount: row.amount,
        assignedById: row.assignedById,
        lastActivityAt: row.lastActivityAt,
    };
}

/**
 * Кому читать историю стадий: переход в окне возможен, только если сделка
 * сдвигалась позже начала окна (`MOVED_TIME`). Остальным история не нужна —
 * так история читается у малой доли открытых сделок.
 */
export function needsHistory(
    row: DealMovementDealRow,
    windowStartMs: number,
): boolean {
    if (row.movedAt === null) return false;
    const movedMs = Date.parse(row.movedAt);
    return !Number.isNaN(movedMs) && movedMs >= windowStartMs;
}
