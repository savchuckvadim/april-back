/**
 * Движение сделок (этап 7.3; постановка
 * ai/tasks/ai-polyansky-method/2026-11-10-deal-movement.md): статус открытой
 * сделки считает КОД по досье — стадии, звонки и дела, договорённости.
 * Модель статус не ставит: она пишет только короткое «что сделать».
 *
 * Подписи статусов для людей — только в
 * `@lib/portal-lib/store/app-settings` (`DEAL_MOVEMENT_STATUS_LABELS`);
 * коды ниже не меняются (решение владельца 20.11.2026).
 */

/**
 * Статус сделки. Порядок — порядок проверки правил (первое сработавшее) и
 * важность в очереди записей: «Вернулась назад», «Без внимания» (дольше
 * срока, работы нет), «Без продвижения» (дольше срока, работа есть),
 * «Под риском», «Движется».
 */
export const DEAL_MOVEMENT_STATUSES = [
    'rolled_back',
    'abandoned',
    'stuck',
    'at_risk',
    'moving',
] as const;
export type DealMovementStatus = (typeof DEAL_MOVEMENT_STATUSES)[number];

/**
 * Тревожные статусы — всё, кроме «движется»; порядок — важность (как
 * порядок правил). Они идут в счёт проблемных сделок сводки.
 */
export const DEAL_MOVEMENT_ALARM_STATUSES = [
    'rolled_back',
    'abandoned',
    'stuck',
    'at_risk',
] as const satisfies readonly DealMovementStatus[];

export const isDealMovementAlarm = (status: DealMovementStatus): boolean =>
    (DEAL_MOVEMENT_ALARM_STATUSES as readonly DealMovementStatus[]).includes(
        status,
    );

/**
 * Статусы, о которых в ленту сделки НЕ пишем (решение 20.11.2026): сделку
 * «без внимания» никто не открывает — она видна только в сводке и снимке.
 * Смена на такой статус считается «сказанной» молча.
 */
export const DEAL_MOVEMENT_FEED_SILENT_STATUSES = [
    'abandoned',
] as const satisfies readonly DealMovementStatus[];

export const isDealMovementFeedSilent = (status: DealMovementStatus): boolean =>
    (
        DEAL_MOVEMENT_FEED_SILENT_STATUSES as readonly DealMovementStatus[]
    ).includes(status);

/**
 * Тяжесть статуса для «новой проблемы» (решение владельца 20.11.2026):
 * новая — переход из «Движется» в любой проблемный и любое ухудшение
 * («Без продвижения» → «Под риском» или «Без внимания», любой →
 * «Вернулась назад»). Улучшение («Без внимания» → «Без продвижения») —
 * не новая проблема. Отдельно от порядка правил: он про проверку, а не
 * про то, что хуже.
 */
export const DEAL_MOVEMENT_SEVERITY: Readonly<
    Record<DealMovementStatus, number>
> = {
    moving: 0,
    stuck: 1,
    at_risk: 2,
    abandoned: 3,
    rolled_back: 4,
};

/** Сделке стало хуже: новый статус тревожный и тяжелее прежнего. */
export const isDealMovementWorsened = (
    from: DealMovementStatus,
    to: DealMovementStatus,
): boolean =>
    isDealMovementAlarm(to) &&
    DEAL_MOVEMENT_SEVERITY[to] > DEAL_MOVEMENT_SEVERITY[from];

/** Почему сделка получила статус. */
export const DEAL_MOVEMENT_REASONS = [
    // вернулась назад
    'stage_back',
    // без внимания: дольше срока, ни звонков, ни дел за окно
    'no_work',
    // без продвижения: дольше срока, работа есть, стадия стоит
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
 * Откуда срок стадии: `history` — p90 дней в стадии по истории портала,
 * `default` — общий порог настройки (истории по стадии мало).
 */
export const DEAL_MOVEMENT_LIMIT_SOURCES = ['history', 'default'] as const;
export type DealMovementLimitSource =
    (typeof DEAL_MOVEMENT_LIMIT_SOURCES)[number];

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

/** Вид работы по сделке из дел Битрикса. */
export const DEAL_MOVEMENT_WORK_KINDS = ['call', 'activity', 'task'] as const;
export type DealMovementWorkKind = (typeof DEAL_MOVEMENT_WORK_KINDS)[number];

/**
 * Работа по сделке из дел Битрикса: любой звонок (в том числе короткий и
 * недозвон), созданное или закрытое дело, задача (решение 20.11.2026).
 */
export interface DealMovementWork {
    /** Момент работы (начало звонка, создание или закрытие дела), ISO 8601. */
    at: string;
    kind: DealMovementWorkKind;
    /** Звонок без разговора (недозвон, сброс); у дел и задач — false. */
    missed: boolean;
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
     * null — неизвестна. Свежая активность — работа по сделке.
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
    /**
     * Звонки, дела и задачи из Битрикса (любой порядок). Читаются только у
     * сделок, которым без них досталось бы «Без внимания»; у остальных —
     * пусто (решение 20.11.2026: без лишней нагрузки на Битрикс).
     */
    work: readonly DealMovementWork[];
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
    /**
     * За сколько дней читаются звонки и дела: «ни звонков, ни дел N дней»
     * точно в этих пределах, дальше — «больше N дней».
     */
    workLookbackDays: number;
    /** Вероятность продажи, ниже которой сделка под риском; null — не проверять. */
    chanceMin: number | null;
    /** Сумма, с которой проверяется низкая вероятность; null — не проверять. */
    amountMin: number | null;
}

export const DEAL_MOVEMENT_DEFAULTS: DealMovementThresholds = {
    windowDays: 14,
    stuckDefaultDays: 21,
    agreedStillDays: 12,
    workLookbackDays: 60,
    chanceMin: null,
    amountMin: null,
};

/** Работа по сделке за окно — для причины «Без продвижения». */
export interface DealMovementRecentWork {
    /** Дни звонков 'YYYY-MM-DD' по порядку (и разобранных, и из дел). */
    callDays: string[];
    /** Все звонки окна — недозвоны. */
    callsMissed: boolean;
    /** Дни созданных или закрытых дел. */
    activityDays: string[];
    /** Дни созданных или закрытых задач. */
    taskDays: string[];
    /** Дни смены стадии. */
    stageDays: string[];
    /**
     * День последней активности по сделке (`LAST_ACTIVITY_TIME`), если
     * ничего другого за окно не нашлось; иначе null.
     */
    activityOnly: string | null;
}

/** Числа, на которые опираются причины, — для текста человеку. */
export interface DealMovementFacts {
    /** Дней в текущей стадии. */
    daysInStage: number;
    /** Срок, с которым сравнивали: норма портала или порог по умолчанию. */
    stageLimitDays: number;
    /** Откуда срок: история портала или общий порог. */
    stageLimitSource: DealMovementLimitSource;
    /**
     * Дней без работы по сделке (звонок, дело, задача, смена стадии,
     * активность); null — момента не найти.
     */
    idleDays: number | null;
    /** Предел точности «дней без работы» (`workLookbackDays`). */
    idleLookbackDays: number;
    /** Работа за окно; null — работы за окно нет. */
    recentWork: DealMovementRecentWork | null;
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
