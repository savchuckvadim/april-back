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
    quantileOf,
    type AiTargets,
    type StageSlaFact,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { calendarWarnings } from '../domain/loaders/calendar.util';
import {
    AI_SANITY_LIMITS,
    AI_SANITY_PROXY_DAYS_SOURCE,
    AI_SANITY_RULES,
    AI_SANITY_SKIP_REASONS,
    AiSanityRuleCode,
    AiSanityRuleResult,
    SanityCallFact,
    SanityExposureFact,
    SanityLevelFact,
} from './sanity.types';

const PERCENT = 100;

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
                `Цель уровня ${level} — ${target.sales} продаж, медиана ` +
                    `факта полосы ${median} (n = ${sales.length}): цель и ` +
                    'факт разошлись больше чем в полтора раза',
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
            warnings.push(
                `SLA стадии ${stage}: договорённость ${days} дн., факт ` +
                    `p25 ${fact.p25} / p50 ${fact.p50} / p90 ${fact.p90} дн. ` +
                    `(n = ${fact.n}) — половина сделок вне договорённости`,
            );
        }
    }
    return checked === 0
        ? skip(AI_SANITY_RULES.sla, AI_SANITY_SKIP_REASONS.slaFacts)
        : verdict(AI_SANITY_RULES.sla, warnings);
}

/** Порог длительности против фактических длительностей типа звонка. */
export function durationRule(
    thresholds: Readonly<Record<string, number>>,
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
    for (const [callType, threshold] of Object.entries(thresholds)) {
        const durations = byType.get(callType) ?? [];
        if (durations.length < minN) continue;
        checked += 1;
        const cut =
            durations.filter(value => value < threshold).length /
            durations.length;
        if (cut > AI_SANITY_LIMITS.durationCutShare) {
            warnings.push(
                `Порог длительности типа ${callType} (${threshold} с) ` +
                    `отрезает ${Math.round(cut * PERCENT)} % звонков типа: ` +
                    `p10 ${Math.round(quantileOf(durations, 0.1))} / ` +
                    `p50 ${Math.round(quantileOf(durations, 0.5))} / ` +
                    `p90 ${Math.round(quantileOf(durations, 0.9))} с ` +
                    `(n = ${durations.length})`,
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
        .map(
            ([managerId, alerts]) =>
                `Менеджер ${managerId}: алертов за неделю ${alerts.length} ` +
                `(порог ${AI_SANITY_LIMITS.alertsPerManagerWeek}) — ` +
                'разбирать столько некогда, сигнал тонет в шуме',
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
    const warnings =
        proxy.length === 0
            ? []
            : [
                  `Менеджер-месяцев с прокси-отсутствиями ${proxy.length} ` +
                      `(${proxy.map(fact => fact.managerId).join(', ')}) — ` +
                      'они исключены из норм, отсутствия стоит завести руками',
              ];
    return verdict(AI_SANITY_RULES.exposure, warnings);
}
