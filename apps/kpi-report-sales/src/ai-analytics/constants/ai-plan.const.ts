/**
 * Константы ручки «план дня» (план Фазы 2, поток 17 `p2-api-plan-daily`,
 * §5.2 и §5.4): ключ и TTL кэша, текст 403 при выключенной настройке,
 * коды шагов объяснения и коды штатной деградации.
 *
 * Свой файл констант — требование владения общими файлами (§1.6):
 * `constants/ai-analytics.const.ts` и `cache/cache-key.util.ts` поток не
 * трогает, поэтому построитель ключа плана живёт здесь. Схема ключа
 * специально совпадает с секцией `plan` общего паттерна сброса
 * (`buildResetPattern(domain, 'plan')` → `…:{domain}:plan:*`), поэтому
 * `settings/save` сбрасывает планы дня без единой новой строки кода.
 *
 * Чистые константы и чистая функция: без DI, Bitrix и Prisma.
 */
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
} from './ai-analytics.const';

/** Роут ручки внутри префикса `ai-analytics`. */
export const AI_DAILY_PLAN_ROUTE = 'plan/daily' as const;

/**
 * TTL плана дня, секунды (план §3.4): 180 с. План живой — он меняется
 * по ходу дня вместе с фактом, поэтому кэш здесь только гасит всплеск
 * повторных открытий вкладки, а не хранит результат надолго.
 */
export const AI_DAILY_PLAN_TTL_SECONDS = 180;

/**
 * Верхняя граница выборки месячных снапшотов менеджера: план читает один
 * месяц одного менеджера, но стор требует `limit` для широких выборок.
 */
export const AI_DAILY_PLAN_MONTH_LIMIT = 24;

/**
 * 403 при `ai_analytics_daily_plan_enabled = false` (решение владельца,
 * §9 вопрос 4 — принят вариант 403 по образцу `ai_analytics_audit_enabled`,
 * а не пустой конверт).
 */
export const AI_DAILY_PLAN_DISABLED_MESSAGE =
    'План дня выключен на портале: включите признак «План дня в утреннем ' +
    'дайджесте и ручке plan/daily» (ai_analytics_daily_plan_enabled) в ' +
    'настройках приложения kpi-sales портала';

/**
 * Коды штатной деградации (§5.4): нет модели портала — нормы не
 * показываются и план считается по объёму; нет дневного прогноза — то же
 * самое; нет месяца менеджера — считать не из чего, план пуст.
 */
export const AI_DAILY_PLAN_REASONS = {
    /** Нет снапшота `ai-analytics-portal-model`. */
    modelMissing: 'portal-model-missing',
    /** Нет снапшота `ai-analytics-forecast` за этот день. */
    forecastMissing: 'forecast-missing',
    /** Нет снапшота `ai-analytics-manager-month` за месяц. */
    monthMissing: 'manager-month-missing',
} as const;

export type AiDailyPlanReason =
    (typeof AI_DAILY_PLAN_REASONS)[keyof typeof AI_DAILY_PLAN_REASONS];

/** Человеческие подписи причин деградации — их видит руководитель. */
export const AI_DAILY_PLAN_REASON_TEXTS: Record<AiDailyPlanReason, string> = {
    [AI_DAILY_PLAN_REASONS.modelMissing]:
        'Модель портала за месяц ещё не посчитана: нормы не показываем, ' +
        'план дня — по объёму прошлого темпа',
    [AI_DAILY_PLAN_REASONS.forecastMissing]:
        'Дневной прогноз за эту дату не записан: план дня — по объёму ' +
        'прошлого темпа',
    [AI_DAILY_PLAN_REASONS.monthMissing]:
        'Месяц менеджера ещё не посчитан: плана дня нет',
};

/**
 * Оговорки к цели сверх санити-флагов библиотеки (`AI_TARGET_FLAGS`:
 * wish, unreachable-by-volume): цель не задана ни одной ступенью каскада.
 */
export const AI_DAILY_PLAN_WARNINGS = {
    targetEmpty: 'target-empty',
} as const;

export type AiDailyPlanWarning =
    (typeof AI_DAILY_PLAN_WARNINGS)[keyof typeof AI_DAILY_PLAN_WARNINGS];

/** Почему цель недостижима (ropOnly.unreachable). */
export const AI_DAILY_PLAN_UNREACHABLE = {
    /** Требуемый дневной темп ребра выше потолка полосы `cap`. */
    capExceeded: 'cap-exceeded',
    /** Рабочих дней до конца месяца не осталось. */
    noDaysLeft: 'no-days-left',
    /** Разворот упёрся в θ = 0 — объём не определён. */
    edgeThetaZero: 'edge-theta-zero',
} as const;

export type AiDailyPlanUnreachable =
    (typeof AI_DAILY_PLAN_UNREACHABLE)[keyof typeof AI_DAILY_PLAN_UNREACHABLE];

/**
 * Коды шагов объяснения в порядке расчёта (план, тест потока):
 * `G → Y₀ → λ_pipe → N_req → разворот → потолок`. Каждое число шага
 * обязано присутствовать в самом DTO — иначе объяснение не проверяемо.
 */
export const AI_DAILY_PLAN_STEP_CODES = {
    /** `G` — цель месяца. */
    target: 'target',
    /** `Y₀` — закрытые продажи месяца. */
    doneSales: 'done_sales',
    /** `λ_pipe` — ожидание от открытого пайплайна; null — истории нет. */
    pipeline: 'pipeline_expected',
    /** `N_req` — требуемый объём входной активности до конца месяца. */
    requiredVolume: 'required_volume',
    /** Разворот `N_k = N_{k+1}/E[θ_mk]` по рёбрам воронки. */
    unwind: 'unwind',
    /** Потолок дня `plan_day_ceiling × план_τ / D_m`. */
    ceiling: 'ceiling',
} as const;

export type AiDailyPlanStepCode =
    (typeof AI_DAILY_PLAN_STEP_CODES)[keyof typeof AI_DAILY_PLAN_STEP_CODES];

/** Порядок шагов объяснения — контракт витрины и теста. */
export const AI_DAILY_PLAN_STEP_ORDER = [
    AI_DAILY_PLAN_STEP_CODES.target,
    AI_DAILY_PLAN_STEP_CODES.doneSales,
    AI_DAILY_PLAN_STEP_CODES.pipeline,
    AI_DAILY_PLAN_STEP_CODES.requiredVolume,
    AI_DAILY_PLAN_STEP_CODES.unwind,
    AI_DAILY_PLAN_STEP_CODES.ceiling,
] as const satisfies readonly AiDailyPlanStepCode[];

/**
 * Ключ кэша плана дня: `{prefix}:{domain}:plan:{date}:{managerId}`.
 * Роль в ключ не входит — кэшируется полный расчёт, а строки только для
 * руководителя (`ropOnly`) срезает презентер при отдаче.
 */
export function buildDailyPlanKey(
    domain: string,
    date: string,
    managerId: string,
): string {
    const { PLAN } = AI_ANALYTICS_CACHE_SECTIONS;

    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${PLAN}:${date}:${managerId}`;
}
