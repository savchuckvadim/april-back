/**
 * Константы ручки «реконсиляция план-факт» (план Фазы 3, поток П2
 * `p3-plan-fact`): роут, TTL и построитель ключа кэша, лимит выборки
 * месячных снапшотов и коды деградации уровня ручки.
 *
 * Свой файл констант — требование владения общими файлами: поток не
 * трогает `constants/ai-analytics.const.ts` и `cache/cache-key.util.ts`.
 * Секция ключа специально совпадает с общей секцией `plan`, поэтому
 * `settings/save` и `cache/reset` со scope `plan` сбрасывают
 * реконсиляцию без единой новой строки кода.
 *
 * Чистые константы и чистые функции: без DI, Bitrix и Prisma.
 */
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
} from './ai-analytics.const';

/** Роут ручки внутри префикса `ai-analytics`. */
export const AI_PLAN_FACT_ROUTE = 'plan-fact' as const;

/**
 * TTL реконсиляции, секунды. Текущий месяц живой — факт меняется в
 * течение дня, поэтому кэш гасит только всплеск повторных открытий;
 * закрытый месяц уже не изменится, поэтому лежит 30 дней и читается
 * без единого обращения к Битриксу.
 */
export const AI_PLAN_FACT_TTL_SECONDS = {
    /** Месяц ещё идёт. */
    live: 180,
    /** Месяц закрылся: снапшоты заморожены. */
    closed: 30 * 24 * 60 * 60,
} as const;

/**
 * Верхняя граница выборки месячных снапшотов: ручка читает один месяц,
 * но стор требует `limit` для широких выборок по периметру.
 */
export const AI_PLAN_FACT_MONTH_LIMIT = 300;

/** Максимум менеджеров в одном запросе (защита от выборки «весь портал»). */
export const AI_PLAN_FACT_MANAGERS_MAX = 200;

/**
 * Коды деградации уровня ручки (§5.4). Причины уровня строки живут в
 * библиотеке (`PLAN_FACT_REASONS`) — здесь только то, чего в модели нет.
 */
export const AI_PLAN_FACT_REASONS = {
    /** Снапшота `ai-analytics-plan` за месяц нет: целей руководителя нет. */
    planSnapshotMissing: 'plan-snapshot-missing',
    /** Ни одного снапшота `ai-analytics-manager-month` за месяц. */
    monthSnapshotsMissing: 'manager-month-missing',
    /** Настройка `ai_analytics_daily_plan_enabled` выключена. */
    dailyPlanDisabled: 'daily-plan-disabled',
} as const;

export type AiPlanFactReason =
    (typeof AI_PLAN_FACT_REASONS)[keyof typeof AI_PLAN_FACT_REASONS];

/** Человеческие подписи причин — их читает руководитель в витрине. */
export const AI_PLAN_FACT_REASON_TEXTS: Record<AiPlanFactReason, string> = {
    [AI_PLAN_FACT_REASONS.planSnapshotMissing]:
        'Снимок целей руководителя за месяц не сделан: сверять факт не с ' +
        'чем. Снимок берётся 1-го числа ночным конвейером из полей плана ' +
        'сотрудников',
    [AI_PLAN_FACT_REASONS.monthSnapshotsMissing]:
        'Месяцы менеджеров за этот период ещё не рассчитаны: факта нет',
    [AI_PLAN_FACT_REASONS.dailyPlanDisabled]:
        'План дня выключен на портале: «сколько надо в день» не ' +
        'показываем, остальные числа на месте',
};

/**
 * Ключ кэша реконсиляции: `{prefix}:{domain}:plan:fact:{monthKey}:{users}`.
 * Роль в ключ не входит: кэшируется расчёт по запрошенному набору
 * менеджеров, а периметр применяется после чтения.
 */
export function buildPlanFactKey(
    domain: string,
    monthKey: string,
    usersKey: string,
): string {
    const { PLAN } = AI_ANALYTICS_CACHE_SECTIONS;

    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${PLAN}:fact:${monthKey}:${usersKey}`;
}

/** Нормализованный ключ набора менеджеров: дедуп и порядок по числу. */
export function planFactUsersKey(
    managerIds: readonly string[] | undefined,
): string {
    if (managerIds === undefined || managerIds.length === 0) return 'all';

    return [...new Set(managerIds.map(id => String(Number(id))))]
        .sort((left, right) => Number(left) - Number(right))
        .join('_');
}

/** Месяц 'YYYY-MM' закрыт (закончился до месяца даты `now` портала)? */
export function isClosedMonth(monthKey: string, today: string): boolean {
    return monthKey < today.slice(0, 7);
}
