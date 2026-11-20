import { stageQuantileOf } from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_STAGE_NORM } from '../constants/deal-movement.const';

/** Обычный срок стадии портала: дней и на скольких эпизодах посчитан. */
export interface DealMovementStageNorm {
    readonly days: number;
    readonly episodes: number;
}

/**
 * Срок стадии по истории портала (решение 20.11.2026): p90 дней закрытых
 * эпизодов ступени — за столько уходят из стадии 9 сделок из 10. Эпизодов
 * меньше минимума — срока нет, действует общий порог настройки. Дни
 * округляются вверх (квантиль — с защитой от шума float, как у фактов
 * сроков AI-аналитики) и не меньше одного: «дольше срока» — строго больше.
 * Ступень → срок. Чистая функция.
 */
export function dealMovementStageNorms(
    dwell: ReadonlyMap<number, readonly number[]>,
    options: {
        readonly quantile: number;
        readonly minEpisodes: number;
    } = DEAL_MOVEMENT_STAGE_NORM,
): Map<number, DealMovementStageNorm> {
    const norms = new Map<number, DealMovementStageNorm>();
    for (const [order, days] of dwell) {
        if (days.length < options.minEpisodes) continue;
        norms.set(order, {
            days: Math.max(
                1,
                Math.ceil(stageQuantileOf(days, options.quantile)),
            ),
            episodes: days.length,
        });
    }
    return norms;
}
