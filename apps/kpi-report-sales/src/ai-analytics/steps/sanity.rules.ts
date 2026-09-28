/**
 * Правила недельной санити-панели (план Фазы 2, §4.11): чистые функции
 * «решение человека против факта», по одной на правило.
 *
 * Без DI, Битрикс и снапшотов: на входе — уже собранные факты (их разбор
 * из шины — в `sanity.facts.ts`), на выходе — вердикт с человеческим
 * текстом. При нехватке наблюдений правило ПРОПУСКАЕТСЯ с причиной:
 * ложная тревога калибровочного контура хуже молчания.
 */
import {
    minDurationSecOf,
    quantileOf,
    type AiTargets,
    type MinDurationSecByType,
    type StageSlaFact,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { calendarWarnings } from '../domain/loaders/calendar.util';
import {
    alertsWarning,
    durationWarning,
    exposureWarning,
    slaWarning,
    targetWarning,
    timestampLeakWarning,
} from './sanity.texts';
import {
    AI_SANITY_DATA_QUALITY,
    AI_SANITY_LIMITS,
    AI_SANITY_PROXY_DAYS_SOURCE,
    AI_SANITY_RULES,
    AI_SANITY_SKIP_REASONS,
    AiSanityReadiness,
    AiSanityRuleCode,
    AiSanityRuleResult,
    SanityCallFact,
    SanityExposureFact,
    SanityLeakFact,
    SanityLevelFact,
} from './sanity.types';

/** Вердикт правила: есть предупреждения — «warning», иначе «ok». */
const verdict = (
    rule: AiSanityRuleCode,
    warnings: string[],
): AiSanityRuleResult => ({
    rule,
    status: warnings.length > 0 ? 'warning' : 'ok',
    warnings,
});

/** Пропуск правила: причина обязательна. */
const skip = (rule: AiSanityRuleCode, reason: string): AiSanityRuleResult => ({
    rule,
    status: 'skipped',
    warnings: [],
    reason,
});

/** Группировка чисел по ключу (полоса стажа, тип звонка, менеджер). */
function groupBy<T>(
    items: readonly T[],
    key: (item: T) => string,
    value: (item: T) => number | null,
): Map<string, number[]> {
    const map = new Map<string, number[]>();
    for (const item of items) {
        const measure = value(item);
        if (measure === null) continue;
        const bucket = map.get(key(item)) ?? [];
        bucket.push(measure);
        map.set(key(item), bucket);
    }
    return map;
}

/** Цель уровня против медианы факта полосы за последние месяцы. */
export function targetRule(
    targets: AiTargets,
    facts: readonly SanityLevelFact[],
    minN: number,
): AiSanityRuleResult {
    const byLevel = groupBy(
        facts,
        fact => fact.level,
        fact => fact.sales,
    );
    const warnings: string[] = [];
    let checked = 0;
    for (const [level, target] of Object.entries(targets.byLevel)) {
        const sales = byLevel.get(level) ?? [];
        if (target.sales === null || sales.length < minN) continue;
        checked += 1;
        const median = quantileOf(sales, 0.5);
        const ratio = median > 0 ? target.sales / median : Infinity;
        if (
            ratio > AI_SANITY_LIMITS.targetGapRatio ||
            ratio < 1 / AI_SANITY_LIMITS.targetGapRatio
        ) {
            warnings.push(
                targetWarning(level, target.sales, median, sales.length),
            );
        }
    }
    return checked === 0
        ? skip(AI_SANITY_RULES.target, AI_SANITY_SKIP_REASONS.targetFacts)
        : verdict(AI_SANITY_RULES.target, warnings);
}

/** Договорённости об SLA против фактических квантилей сроков стадии. */
export function slaRule(
    agreed: Readonly<Record<string, number>>,
    facts: Readonly<Record<string, StageSlaFact>>,
    minN: number,
): AiSanityRuleResult {
    const warnings: string[] = [];
    let checked = 0;
    for (const [stage, days] of Object.entries(agreed)) {
        const fact = facts[stage];
        if (!fact || fact.n < minN) continue;
        checked += 1;
        if (fact.p50 > days) {
            warnings.push(slaWarning(stage, days, fact));
        }
    }
    return checked === 0
        ? skip(AI_SANITY_RULES.sla, AI_SANITY_SKIP_REASONS.slaFacts)
        : verdict(AI_SANITY_RULES.sla, warnings);
}

/**
 * Порог длительности против фактических длительностей типа звонка.
 *
 * Порог берётся тем же правилом, что и в пульсе, — `minDurationSecOf`
 * (тип → ключ «все прочие» → дефолт реестра): панель обязана проверять
 * ровно тот гейт, который отсекает звонки от разбора, иначе руководителю
 * покажут не то число. Поэтому перебираются типы, которые реально
 * встретились в неделе, а не ключи карты: тип без своего порога всё равно
 * отсекается значением по умолчанию.
 */
export function durationRule(
    thresholds: MinDurationSecByType,
    rows: readonly SanityCallFact[],
    minN: number,
): AiSanityRuleResult {
    const byType = groupBy(
        rows.filter(row => row.callType !== ''),
        row => row.callType,
        row => row.durationSec,
    );
    const warnings: string[] = [];
    let checked = 0;
    for (const [callType, durations] of byType) {
        if (durations.length < minN) continue;
        const threshold = minDurationSecOf(callType, thresholds);
        checked += 1;
        const cut =
            durations.filter(value => value < threshold).length /
            durations.length;
        if (cut > AI_SANITY_LIMITS.durationCutShare) {
            warnings.push(
                durationWarning(
                    callType,
                    threshold,
                    cut,
                    {
                        p10: quantileOf(durations, 0.1),
                        p50: quantileOf(durations, 0.5),
                        p90: quantileOf(durations, 0.9),
                    },
                    durations.length,
                ),
            );
        }
    }
    return checked === 0
        ? skip(AI_SANITY_RULES.duration, AI_SANITY_SKIP_REASONS.durationFacts)
        : verdict(AI_SANITY_RULES.duration, warnings);
}

/** Шум алертов: больше трёх на менеджера за неделю — это не сигнал. */
export function alertsRule(
    rows: readonly SanityCallFact[],
    minN: number,
): AiSanityRuleResult {
    if (rows.length < minN) {
        return skip(AI_SANITY_RULES.alerts, AI_SANITY_SKIP_REASONS.alertFacts);
    }
    const byManager = groupBy(
        rows.filter(row => row.alert),
        row => row.managerId,
        () => 1,
    );
    const warnings = [...byManager.entries()]
        .filter(
            ([, alerts]) =>
                alerts.length > AI_SANITY_LIMITS.alertsPerManagerWeek,
        )
        .map(([, alerts]) =>
            alertsWarning(alerts.length, AI_SANITY_LIMITS.alertsPerManagerWeek),
        );
    return verdict(AI_SANITY_RULES.alerts, warnings);
}

/** Календарь: «на год праздников нет» и месяцы со странным числом дней. */
export function calendarRule(
    calendar: WorkCalendar,
    day: string,
): AiSanityRuleResult {
    return verdict(AI_SANITY_RULES.calendar, calendarWarnings(calendar, day));
}

/** Менеджер-месяцы с прокси-отсутствиями: они выпали из оценки норм. */
export function exposureRule(
    facts: readonly SanityExposureFact[],
): AiSanityRuleResult {
    if (facts.length === 0) {
        return skip(
            AI_SANITY_RULES.exposure,
            AI_SANITY_SKIP_REASONS.exposureFacts,
        );
    }
    const proxy = facts.filter(
        fact => fact.daysSource === AI_SANITY_PROXY_DAYS_SOURCE,
    );
    const managers = new Set(proxy.map(fact => fact.managerId)).size;
    const warnings = managers === 0 ? [] : [exposureWarning(managers)];
    return verdict(AI_SANITY_RULES.exposure, warnings);
}

/**
 * Плацебо-тест меток времени (план §4.4, аудит N2): доля продаж, закрытых
 * раньше последней презентации или счёта, против порога `maxPct`. Сам
 * флаг ставит библиотека (`timestampLeakShare`), правило переводит его в
 * слова и молчит при нехватке продаж.
 */
export function timestampLeakRule(
    fact: SanityLeakFact | null,
    minN: number,
): AiSanityRuleResult {
    if (fact === null || fact.n < minN) {
        return skip(
            AI_SANITY_RULES.timestampLeak,
            AI_SANITY_SKIP_REASONS.leakFacts,
        );
    }
    const warnings = fact.flagged ? [timestampLeakWarning(fact)] : [];
    return verdict(AI_SANITY_RULES.timestampLeak, warnings);
}

/**
 * Готовность по качеству данных из вердиктов правил: плацебо-тест
 * пропущен — `unknown`, предупредил — `flagged`, иначе `ok`. Коды правил
 * с предупреждениями едут рядом — dq-гейту видно, что именно не так.
 */
export function buildSanityReadiness(
    rules: readonly AiSanityRuleResult[],
    leak: SanityLeakFact | null,
): AiSanityReadiness {
    const leakRule = rules.find(
        rule => rule.rule === AI_SANITY_RULES.timestampLeak,
    );
    const dataQuality =
        leakRule === undefined || leakRule.status === 'skipped'
            ? AI_SANITY_DATA_QUALITY.unknown
            : leakRule.status === 'warning'
              ? AI_SANITY_DATA_QUALITY.flagged
              : AI_SANITY_DATA_QUALITY.ok;
    return {
        dataQuality,
        timestampLeak: leak,
        warningRules: rules
            .filter(rule => rule.status === 'warning')
            .map(rule => rule.rule),
    };
}
