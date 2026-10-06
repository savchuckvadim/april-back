import {
    BITRIX_CALL_CLASS,
    BitrixCallClass,
} from '../context/bitrix-call-context';

export interface RateLimitPlanConfig {
    /** Ёмкость ведра — максимальный счётчик до блокировки (X) */
    capacity: number;
    /** Скорость дренажа в секунду (Y) */
    ratePerSec: number;
}

export const RATE_LIMIT_PLAN_CONFIGS = {
    regular: { capacity: 50, ratePerSec: 2 },
    enterprise: { capacity: 250, ratePerSec: 5 },
} as const satisfies Record<string, RateLimitPlanConfig>;

export type BitrixPlanKey = keyof typeof RATE_LIMIT_PLAN_CONFIGS;

/**
 * Тариф по умолчанию — обычный: так Битрикс считает лимит у всех тарифов,
 * кроме энтерпрайза. Портал на энтерпрайзе указывает это в своих
 * настройках («Портал (общие)»). Переменной окружения больше нет: тариф —
 * свойство портала, а не сервера (решение владельца 06.10.2026).
 */
export const DEFAULT_BITRIX_PLAN: BitrixPlanKey = 'regular';

/** Что делать, когда слот в ведре не дождались за отведённое время. */
export const RATE_LIMIT_TIMEOUT_ACTION = {
    /** Пропустить запрос в Битрикс без слота — человек не должен ждать вечно. */
    pass: 'pass',
    /** Отказать вызывающему: фон мимо очереди не ходит. */
    reject: 'reject',
} as const;

export type RateLimitTimeoutAction =
    (typeof RATE_LIMIT_TIMEOUT_ACTION)[keyof typeof RATE_LIMIT_TIMEOUT_ACTION];

/** Правила одного класса вызовов. */
export interface RateLimitClassPolicy {
    /**
     * Доля ведра, доступная классу (0 < share ≤ 1). Фону меньше единицы:
     * он перестаёт брать слоты раньше, чем ведро заполнится, — остаток
     * держится в запасе для менеджеров.
     */
    share: number;
    /** Сколько ждать слот, мс. */
    maxWaitMs: number;
    onTimeout: RateLimitTimeoutAction;
}

/**
 * Приоритет менеджеров (решение владельца, 05.10.2026).
 *
 *  - интерактив берёт слоты из всего ведра; не дождался за 15 с — запрос
 *    уходит без слота (как раньше): отказать человеку хуже, чем рискнуть
 *    ответом «лимит превышен» от самого Битрикса;
 *  - фону доступно 60% ведра (30 из 50): при любом фоновом потоке у
 *    менеджеров остаётся запас на всплеск в 20 запросов. Фон очередь НЕ
 *    обходит никогда: ждёт до 10 минут и получает отказ, а не проход.
 *
 * Значения переопределяются настройками портала («Общие настройки
 * портала» в админке): тариф, доля фона и сроки ожидания — см.
 * {@link resolveRateLimitRules}.
 */
export const RATE_LIMIT_CLASS_POLICIES: Record<
    BitrixCallClass,
    RateLimitClassPolicy
> = {
    [BITRIX_CALL_CLASS.interactive]: {
        share: 1,
        maxWaitMs: 15_000,
        onTimeout: RATE_LIMIT_TIMEOUT_ACTION.pass,
    },
    [BITRIX_CALL_CLASS.background]: {
        share: 0.6,
        maxWaitMs: 600_000,
        onTimeout: RATE_LIMIT_TIMEOUT_ACTION.reject,
    },
};

/**
 * Лимит конкретного портала — из его настроек. Не задано — действует
 * значение по умолчанию: ограничитель включён, тариф
 * {@link DEFAULT_BITRIX_PLAN}, правила классов —
 * {@link RATE_LIMIT_CLASS_POLICIES}.
 */
export interface BitrixRateLimitOverrides {
    /**
     * Ограничитель включён. Выключать — только на время разбора: без него
     * приложения упираются в лимит Битрикса, и менеджеры получают ошибки.
     */
    enabled?: boolean;
    /** Тариф портала: от него ёмкость ведра и скорость. */
    plan?: BitrixPlanKey;
    /** Доля ведра для фона, 0 < share ≤ 1. */
    backgroundShare?: number;
    /** Сколько запрос менеджера ждёт слот, мс. */
    interactiveMaxWaitMs?: number;
    /** Сколько фоновая задача ждёт слот, мс. */
    backgroundMaxWaitMs?: number;
}

/** Правила ограничителя для одного портала. */
export interface RateLimitRules {
    /** Выключен — запросы идут в Битрикс без очереди. */
    enabled: boolean;
    config: RateLimitPlanConfig;
    policies: Record<BitrixCallClass, RateLimitClassPolicy>;
}

/** Потолки сроков ожидания: опечатка в настройках не должна вешать запросы. */
const MAX_INTERACTIVE_WAIT_MS = 120_000;
const MAX_BACKGROUND_WAIT_MS = 3_600_000;

const positiveUpTo = (value: number | undefined, max: number): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.min(value, max)
        : null;

/**
 * Правила для портала: значения по умолчанию, поверх — его настройки.
 * Бессмысленные значения (не число, ноль, минус, неизвестный тариф)
 * игнорируются — действует значение по умолчанию.
 */
export const resolveRateLimitRules = (
    overrides?: BitrixRateLimitOverrides,
): RateLimitRules => {
    const plan =
        overrides?.plan && overrides.plan in RATE_LIMIT_PLAN_CONFIGS
            ? overrides.plan
            : DEFAULT_BITRIX_PLAN;
    const interactive =
        RATE_LIMIT_CLASS_POLICIES[BITRIX_CALL_CLASS.interactive];
    const background = RATE_LIMIT_CLASS_POLICIES[BITRIX_CALL_CLASS.background];
    // Доля больше 100% — ошибка ввода, а не «весь лимит фону»: такое
    // значение отбрасывается, иначе фон съел бы запас менеджеров.
    const rawShare = overrides?.backgroundShare;
    const share =
        typeof rawShare === 'number' &&
        Number.isFinite(rawShare) &&
        rawShare > 0 &&
        rawShare <= 1
            ? rawShare
            : null;

    return {
        enabled: overrides?.enabled ?? true,
        config:
            RATE_LIMIT_PLAN_CONFIGS[plan] ?? RATE_LIMIT_PLAN_CONFIGS.regular,
        policies: {
            [BITRIX_CALL_CLASS.interactive]: {
                ...interactive,
                maxWaitMs:
                    positiveUpTo(
                        overrides?.interactiveMaxWaitMs,
                        MAX_INTERACTIVE_WAIT_MS,
                    ) ?? interactive.maxWaitMs,
            },
            [BITRIX_CALL_CLASS.background]: {
                ...background,
                share: share ?? background.share,
                maxWaitMs:
                    positiveUpTo(
                        overrides?.backgroundMaxWaitMs,
                        MAX_BACKGROUND_WAIT_MS,
                    ) ?? background.maxWaitMs,
            },
        },
    };
};

/** Предел счётчика ведра для класса: целое, не меньше 1 и не больше ёмкости. */
export const resolveClassLimit = (capacity: number, share: number): number => {
    const safeShare =
        Number.isFinite(share) && share > 0 ? Math.min(share, 1) : 1;
    return Math.max(1, Math.floor(capacity * safeShare));
};
