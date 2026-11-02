/**
 * Факты методики для сигналов «Внимания» (этап 2 плана методики Полянского,
 * 02.11.2026): спирали презентаций — в сигнал «слабые презентации», звонки
 * с продвижением сделки без качества — в сигнал «купил бы и без менеджера».
 * Числа приходят из разборов focus-v3.0 (продвижение считает ядро для всех
 * порталов, спирали — только методика со спиралями).
 */

/** Спирали презентаций менеджера за период (разборы, где спирали считались). */
export interface AttentionPresentationSpirals {
    /** Презентаций, где спирали посчитаны. */
    n: number;
    /** Полных витков в среднем на презентацию. */
    meanFull: number;
    /** Норма методики — минимум полных витков (по самому свежему разбору). */
    minFull: number;
    /** Презентации, где полных витков меньше нормы (id по возрастанию). */
    belowMinCallIds: string[];
}

/** Звонок, где сделка продвинулась, а оценка разговора ниже порога качества. */
export interface AttentionProgressCall {
    transcriptionId: string;
    callType: string | null;
    /** Общая оценка звонка 1–10. */
    score: number;
    /** Продвижение сделки по звонку 1–5. */
    dealProgress: number;
}

/**
 * Продвижение сделок менеджера за период: сколько звонков двинули сделку
 * и какие из них — без качества («клиент купил бы и без менеджера»).
 */
export interface AttentionProgressFacts {
    /** Звонков с продвижением не ниже порога deal_progress_moving_min. */
    n: number;
    /** Из них с оценкой ниже quality_progress_score_min, id по возрастанию. */
    calls: AttentionProgressCall[];
}

/** Коды опор карточек методики. */
export const ATTENTION_METHODOLOGY_BASIS_CODES = {
    spiralsMean: 'presentation_spirals_mean',
    progressNoQualityCalls: 'progress_no_quality_calls',
} as const;
