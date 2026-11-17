/**
 * Движение сделок (этап 7.3; постановка
 * ai/tasks/ai-polyansky-method/2026-11-10-deal-movement.md): статус открытой
 * сделки считает КОД по досье — стадии, разборы звонков, договорённости,
 * дела. Модель статус не ставит: она пишет только короткое «что сделать».
 */

/** Статус сделки. Порядок — порядок проверки правил: первое сработавшее. */
export const DEAL_MOVEMENT_STATUSES = [
    'rolled_back',
    'stuck',
    'at_risk',
    'moving',
] as const;
export type DealMovementStatus = (typeof DEAL_MOVEMENT_STATUSES)[number];

/** Почему сделка получила статус. */
export const DEAL_MOVEMENT_REASONS = [
    // откатилась
    'stage_back',
    // застряла
    'stage_overdue',
    // под риском
    'step_overdue',
    'progress_low_twice',
    'agreed_but_still',
    'low_chance_big_sum',
    'forgotten',
    // движется
    'stage_forward',
    'progress_ok',
    'step_done',
    'no_signals',
] as const;
export type DealMovementReason = (typeof DEAL_MOVEMENT_REASONS)[number];

/**
 * Смена стадии сделки. Порядок — ступень лестницы «ОП Основная»
 * (`PBX_DEAL_SALES_BASE_STAGES`): закрытые стадии (успех, провал и прочие
 * финалы) — от `PBX_DEAL_SALES_BASE_WON_ORDER` и выше.
 */
export interface DealMovementTransition {
    /** Момент перехода, ISO 8601. */
    at: string;
    /** Порядок стадии в лестнице до и после перехода. */
    fromOrder: number;
    toOrder: number;
}

/** Разбор звонка по сделке в объёме правил. */
export interface DealMovementCall {
    /** Момент звонка, ISO 8601. */
    at: string;
    /** Продвижение сделки по звонку 1–5; null — в разборе его нет. */
    progress: number | null;
    /** Договорённость о следующем шаге; null — в разборе её нет. */
    nextStep: { set: boolean; date: string | null } | null;
}

/** Досье открытой сделки: всё, по чему считается статус. */
export interface DealMovementDossier {
    dealId: string;
    /** Когда сделка вошла в текущую стадию, ISO 8601. */
    stageEnteredAt: string;
    /**
     * Порядок текущей стадии в лестнице; null — стадия вне лестницы
     * (тогда текущей считается стадия последнего перехода).
     */
    stageOrder: number | null;
    /**
     * Последняя активность по сделке (`LAST_ACTIVITY_TIME`), ISO 8601;
     * null — неизвестна. Свежая активность снимает «застряла».
     */
    lastActivityAt: string | null;
    /** Смены стадий сделки (любой порядок). */
    transitions: readonly DealMovementTransition[];
    /** Обычный срок стадии на портале, дней (p90 факта); null — ряд короткий. */
    stageNormDays: number | null;
    /** Вероятность продажи из текущей стадии 0–1; null — неизвестна. */
    stageChance: number | null;
    /** Сумма сделки; null — не указана. */
    amount: number | null;
    /** Разборы звонков по сделке (любой порядок). */
    calls: readonly DealMovementCall[];
    /**
     * Моменты контакта по сделке помимо разобранных звонков, ISO 8601:
     * закрытые дела и задачи либо последняя активность по сделке.
     */
    closedActivitiesAt: readonly string[];
    /** Сделка в списке «забытых» аудита сделок; null — аудит не считался. */
    forgotten: boolean | null;
}

/** Пороги правил — настройки портала. */
export interface DealMovementThresholds {
    /** Окно свежести событий, дней. */
    windowDays: number;
    /** Срок стадии, когда своего ряда портала мало, дней. */
    stuckDefaultDays: number;
    /** Сколько дней стадия может стоять после согласия по звонку. */
    agreedStillDays: number;
    /** Вероятность продажи, ниже которой сделка под риском; null — не проверять. */
    chanceMin: number | null;
    /** Сумма, с которой проверяется низкая вероятность; null — не проверять. */
    amountMin: number | null;
}

export const DEAL_MOVEMENT_DEFAULTS: DealMovementThresholds = {
    windowDays: 14,
    stuckDefaultDays: 21,
    agreedStillDays: 12,
    chanceMin: null,
    amountMin: null,
};

/** Числа, на которые опираются причины, — для текста человеку. */
export interface DealMovementFacts {
    /** Дней в текущей стадии. */
    daysInStage: number;
    /** Срок, с которым сравнивали: норма портала или порог по умолчанию. */
    stageLimitDays: number;
    /** Дата просроченной или выполненной договорённости 'YYYY-MM-DD'. */
    stepDate: string | null;
    /** Последняя оценка продвижения по звонку. */
    lastProgress: number | null;
    /** Дней с момента звонка с согласием, пока стадия стоит. */
    daysSinceAgreed: number | null;
}

export interface DealMovementVerdict {
    dealId: string;
    status: DealMovementStatus;
    /** Все сработавшие причины статуса, главная — первой. */
    reasons: DealMovementReason[];
    facts: DealMovementFacts;
}
