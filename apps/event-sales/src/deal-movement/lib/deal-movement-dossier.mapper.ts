import type {
    DealMovementCall,
    DealMovementDossier,
    DealMovementNightDeal,
    DealMovementTransition,
    DealMovementVerdict,
    DealMovementWork,
} from '@lib/sales-ai-analytics';
import type { DealMovementDealRow } from '../types/deal-movement.types';

/** Чего у досье может не быть: срок стадии по истории и дела Битрикса. */
export interface DealMovementDossierExtra {
    /** Срок стадии по истории портала, дней; null — истории мало. */
    readonly stageNormDays: number | null;
    /** Звонки, дела и задачи из Битрикса; пусто — не читались. */
    readonly work: readonly DealMovementWork[];
}

const NO_EXTRA: DealMovementDossierExtra = { stageNormDays: null, work: [] };

/**
 * Сделка, её переходы, разобранные звонки, срок стадии и дела → досье
 * правил статуса.
 *
 * - срок стадии — p90 по истории портала (20.11.2026), истории мало —
 *   null: тогда общий порог настройки;
 * - дела Битрикса — только у сделок, которым без них досталось бы «Без
 *   внимания» (20.11.2026);
 * - вероятность продажи (θ) — null: правило по θ выключено; признак
 *   аудита сделок — null (решение 17.11.2026);
 * - контактом после договорённости считается разобранный звонок или
 *   ЛЮБАЯ активность по сделке позже её даты — поэтому последняя
 *   активность кладётся в `closedActivitiesAt`.
 */
export function buildDealMovementDossier(
    row: DealMovementDealRow,
    transitions: readonly DealMovementTransition[],
    calls: readonly DealMovementCall[],
    extra: DealMovementDossierExtra = NO_EXTRA,
): DealMovementDossier {
    return {
        dealId: String(row.dealId),
        // MOVED_TIME пуст у старых сделок — тогда отсчёт от создания.
        stageEnteredAt: row.movedAt ?? row.createdAt ?? '',
        stageOrder: row.stageOrder,
        lastActivityAt: row.lastActivityAt,
        transitions,
        stageNormDays: extra.stageNormDays,
        stageChance: null,
        amount: row.amount,
        calls,
        closedActivitiesAt: row.lastActivityAt ? [row.lastActivityAt] : [],
        work: extra.work,
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
