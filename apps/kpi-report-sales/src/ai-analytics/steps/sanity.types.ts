/**
 * Словарь недельной санити-панели (план Фазы 2, §4.11 и поток 12): коды
 * правил, пороги, соответствие «код параметра SLA → стадия лестницы» и
 * формы вердикта, отчёта и результата шага.
 *
 * Вынесено из `sanity.step.ts`, чтобы рабочий файл остался в пределах
 * 300 строк (прецедент — `model/stage-theta.types.ts` библиотеки).
 * Магических строк в панели нет: коды правил и стадии — только отсюда.
 */
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { AiPipelineRhythm } from '../constants/ai-snapshot.const';
import type { AiPipelineStepResult } from './step.types';

/**
 * Код шага и его ритмы: панель считается раз в неделю, по понедельникам,
 * и на месячной заморозке — там её отчёт из шины (ключ `sanity`) забирает
 * месячная модель портала в поле `sanity` ТОГО ЖЕ прогона. Отдельного
 * снапшота у панели нет и чужие записи она не переписывает (аудит N1):
 * предупреждения уезжают в `etl-run.warnings`, отчёт — в шину.
 */
export const AI_SANITY_STEP_CODE = 'sanity' as const;
export const AI_SANITY_STEP_RHYTHMS = [
    'weekly',
    'monthly',
] as const satisfies readonly AiPipelineRhythm[];

/** Коды правил панели — они же ключи вердиктов в снапшоте модели. */
export const AI_SANITY_RULES = {
    /** Цель уровня против медианы факта полосы стажа. */
    target: 'target-vs-fact',
    /** Договорённости об SLA против фактических квантилей сроков. */
    sla: 'sla-vs-fact',
    /** Порог длительности против фактических длительностей типа. */
    duration: 'duration-threshold',
    /** Шум алертов: больше трёх на менеджера в неделю. */
    alerts: 'alert-noise',
    /** «На год праздников нет» и месяцы со странным числом рабочих дней. */
    calendar: 'calendar-holidays',
    /** Менеджер-месяцы с прокси-отсутствиями (выпали из норм). */
    exposure: 'exposure-proxy',
    /** Плацебо-тест меток времени: продажи «закрыты до активности». */
    timestampLeak: 'timestamp-leak',
} as const;
export type AiSanityRuleCode =
    (typeof AI_SANITY_RULES)[keyof typeof AI_SANITY_RULES];

/** Пороги панели: расхождение цели, доля отрезанных звонков, шум алертов. */
export const AI_SANITY_LIMITS = {
    /** Цель оторвана от факта при таком отношении и обратном ему. */
    targetGapRatio: 1.5,
    /** Порог длительности не должен отрезать больше четверти звонков типа. */
    durationCutShare: 0.25,
    /** Алертов на менеджера в неделю больше — это шум, а не сигнал. */
    alertsPerManagerWeek: 3,
    /** Месяцев фактов для медианы полосы стажа. */
    factMonths: 3,
    /** Запасной порог наблюдений, если реестр молчит (`n_min_none`). */
    minObservations: 8,
} as const;

/** Код параметра SLA → стадия лестницы sales_base (без magic strings). */
export const AI_SANITY_SLA_STAGES = {
    sla_refine_days: PBX_DEAL_SALES_BASE_STAGE_CODE.refine,
    sla_decision_days: PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress,
    sla_money_await_days: PBX_DEAL_SALES_BASE_STAGE_CODE.moneyAwait,
} as const;

/**
 * Причины пропуска правил (штатная деградация §5.4): при нехватке
 * наблюдений правило молчит с причиной, а не выдаёт ложную тревогу.
 */
export const AI_SANITY_SKIP_REASONS = {
    targetFacts: 'target-facts-too-few',
    slaFacts: 'sla-facts-missing',
    durationFacts: 'duration-facts-too-few',
    alertFacts: 'alert-facts-too-few',
    exposureFacts: 'exposure-facts-missing',
    /** Плацебо-теста в шине нет либо продаж в нём меньше порога. */
    leakFacts: 'leak-facts-missing',
    /** Ни одно правило не набрало наблюдений — шаг пропущен целиком. */
    noData: 'sanity-no-observations',
} as const;

/** Источник экспозиции, при котором менеджер-месяц исключён из норм. */
export const AI_SANITY_PROXY_DAYS_SOURCE = 'proxy' as const;

/**
 * Вердикт качества данных для dq-гейта: `unknown` — плацебо-тест не
 * отработал или продаж меньше порога, `flagged` — доля протечки выше
 * порога, `ok` — метки времени в порядке.
 */
export const AI_SANITY_DATA_QUALITY = {
    ok: 'ok',
    flagged: 'flagged',
    unknown: 'unknown',
} as const;
export type AiSanityDataQuality =
    (typeof AI_SANITY_DATA_QUALITY)[keyof typeof AI_SANITY_DATA_QUALITY];

/** Вердикт одного правила: предупреждения либо причина пропуска. */
export interface AiSanityRuleResult {
    rule: AiSanityRuleCode;
    status: 'ok' | 'warning' | 'skipped';
    warnings: string[];
    /** Почему правило пропущено (обязательно при status = 'skipped'). */
    reason?: string;
}

/**
 * Готовность по качеству данных: то, что из панели доезжает до dq-гейта
 * (аудит N2 — плацебо-тест меток времени раньше терялся в шине).
 */
export interface AiSanityReadiness {
    dataQuality: AiSanityDataQuality;
    /** Плацебо-тест шага истории стадий; null — шаг не отработал. */
    timestampLeak: SanityLeakFact | null;
    /** Коды правил с предупреждениями — что мешает доверять цифрам. */
    warningRules: AiSanityRuleCode[];
}

/**
 * Санити-отчёт прогона: значение ключа шины `sanity` и поле `sanity`
 * месячной модели портала (модель читает его из шины того же прогона).
 */
export interface AiSanityReport {
    /** День прогона 'YYYY-MM-DD' в TZ портала. */
    day: string;
    /** Разобранная неделя 'YYYY-Www'. */
    weekKey: string;
    /** Момент формирования, ISO (UTC). */
    generatedAt: string;
    rules: AiSanityRuleResult[];
    /** Все предупреждения панели: они же уезжают в журнал прогона. */
    warnings: string[];
    readiness: AiSanityReadiness;
}

/** Результат шага + предупреждения для журнала прогона и сам отчёт. */
export interface AiSanityStepResult extends AiPipelineStepResult {
    warnings: string[];
    report: AiSanityReport;
}

/** Факт менеджер-месяца для медианы полосы: уровень и продажи. */
export interface SanityLevelFact {
    level: string;
    sales: number;
}

/** Звонок в объёме панели: тип, длительность и признак алерта. */
export interface SanityCallFact {
    managerId: string;
    callType: string;
    durationSec: number | null;
    alert: boolean;
}

/** Менеджер-месяц с источником знаменателя экспозиции. */
export interface SanityExposureFact {
    managerId: string;
    daysSource: string;
}

/**
 * Плацебо-тест меток времени в объёме панели — форма писателя
 * `TimestampLeakResult` шага истории стадий без списка эпизодов.
 */
export interface SanityLeakFact {
    /** Продаж в выборке. */
    n: number;
    /** Из них закрыты раньше последней презентации или счёта. */
    leaked: number;
    /** Доля протечки, %. */
    sharePct: number;
    /** Порог в доле (0,05 = 5 %), с которым сравнивалась доля. */
    maxPct: number;
    /** Доля выше порога — dq-гейт не пройден. */
    flagged: boolean;
}
