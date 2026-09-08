/**
 * Поправка величины эффекта на надёжность оценщика (план §4.4, §4.11).
 *
 * Вынесено из `reliability.ts` отдельным файлом: там уже жили измерение
 * σ_llm, ICC(2,1), Спирмен–Браун, группы менеджеров и порядок пар, и с
 * этим куском файл переходил лимит в 300 строк. Публичный вход не менялся —
 * `reliability.ts` реэкспортирует всё, что здесь объявлено.
 */

/** Почему величина эффекта скрыта (надёжность предиктора неизвестна/низка). */
export const RELIABILITY_HIDE_REASONS = {
    unknown: 'reliability-unknown',
    tooLow: 'reliability-too-low',
} as const;
export type ReliabilityHideReason =
    (typeof RELIABILITY_HIDE_REASONS)[keyof typeof RELIABILITY_HIDE_REASONS];

export interface ReliabilityCorrection {
    /** β с поправкой на надёжность; null — величина эффекта скрыта. */
    beta: number | null;
    /** Наблюдённый (заниженный шумом оценщика) коэффициент. */
    betaObserved: number;
    /** Надёжность предиктора-среднего r ∈ (0; 1]; null — не измерена. */
    reliability: number | null;
    hidden: boolean;
    reason?: ReliabilityHideReason;
}

/**
 * Regression calibration (план §4.4, §4.11): шум оценщика в предикторе
 * занижает наклон, поэтому β_true = β_observed / r, где r — надёжность
 * среднего (Спирмен–Браун от ICC).
 *
 * Если надёжность НЕ измерена (r = null) или неположительна, величина
 * эффекта не показывается вовсе: делить на неизвестное число нельзя, а
 * выдавать сырой наклон за истинный — значит врать о размере эффекта.
 * Направление и знак при этом сохраняются в betaObserved.
 */
export function correctForReliability(
    beta: number,
    reliability: number | null | undefined,
): ReliabilityCorrection {
    const observed = Number.isFinite(beta) ? beta : 0;
    if (typeof reliability !== 'number' || !Number.isFinite(reliability)) {
        return {
            beta: null,
            betaObserved: observed,
            reliability: null,
            hidden: true,
            reason: RELIABILITY_HIDE_REASONS.unknown,
        };
    }
    if (reliability <= 0) {
        return {
            beta: null,
            betaObserved: observed,
            reliability,
            hidden: true,
            reason: RELIABILITY_HIDE_REASONS.tooLow,
        };
    }
    const r = Math.min(1, reliability);
    return {
        beta: observed / r,
        betaObserved: observed,
        reliability: r,
        hidden: false,
    };
}
