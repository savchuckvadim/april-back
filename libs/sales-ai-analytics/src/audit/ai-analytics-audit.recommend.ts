/**
 * Рекомендация по порогам 4.11 плана и minDurationSec конвейера разбора
 * по итогам аудита (Фаза 0). Только чистые функции.
 */

/** Правила аудита: пороги, по которым формируется рекомендация. */
export interface AuditRules {
    /** Минимальное n разборов в ячейке (менеджер × тип × месяц) — scoreNone из 4.11. */
    cellMinN: number;
    /** Если меньше этой доли разборов окна лежит в ячейках с n ≥ cellMinN — пороги ниже. */
    cellShareMinPct: number;
    /** Короткий звонок, с (minDurationSec конвейера разбора). */
    shortCallSec: number;
    /** Если доля коротких звонков выше — нужен дешёвый контур для коротких. */
    shortShareMaxPct: number;
}

export const AUDIT_RULES = {
    cellMinN: 8,
    cellShareMinPct: 30,
    shortCallSec: 300,
    shortShareMaxPct: 40,
} as const satisfies AuditRules;

export interface ThresholdRecommendationInput {
    /** Доля разборов окна в ячейках (менеджер × тип × месяц) с n ≥ cellMinN. */
    analyzedInCellsPct: number | null;
    /** То же по ячейкам (менеджер × месяц) без разреза по типу — для контекста. */
    analyzedByManagerMonthPct: number | null;
    /** Доля звонков окна короче shortCallSec. */
    shortPct: number | null;
}

export interface ThresholdRecommendation {
    lowerThresholds: boolean;
    cheapShortContour: boolean;
    lines: string[];
}

function thresholdLines(
    input: ThresholdRecommendationInput,
    rules: AuditRules,
    lowerThresholds: boolean,
): string[] {
    if (input.analyzedInCellsPct === null) {
        return [
            'Разборов в окне нет — пороги 4.11 оценить нельзя, оставить дефолт ' +
                '(none < 8, low 8–19, ok ≥ 20 / ≥ 30 для долей).',
        ];
    }
    const context =
        input.analyzedByManagerMonthPct === null
            ? ''
            : ` (без разреза по типу, только менеджер × месяц: ${input.analyzedByManagerMonthPct} %)`;
    if (lowerThresholds) {
        return [
            `Только ${input.analyzedInCellsPct} % разборов окна лежат в ячейках (менеджер × тип × месяц) ` +
                `с n ≥ ${rules.cellMinN}${context} — это меньше ${rules.cellShareMinPct} %: предложить пороги ниже ` +
                '(scoreNone 8 → 5, scoreLow 20 → 12, rateOk 30 → 20) либо агрегировать по кварталу ' +
                'вместо месяца, пока не накопится история.',
        ];
    }
    return [
        `${input.analyzedInCellsPct} % разборов окна лежат в ячейках (менеджер × тип × месяц) ` +
            `с n ≥ ${rules.cellMinN}${context} — не меньше ${rules.cellShareMinPct} %: пороги 4.11 оставить ` +
            '(none < 8, low 8–19, ok ≥ 20, ≥ 30 для долей).',
    ];
}

function durationLines(
    input: ThresholdRecommendationInput,
    rules: AuditRules,
    cheapShortContour: boolean,
): string[] {
    if (input.shortPct === null) {
        return [
            'Длительности отсутствуют — решение по minDurationSec отложить.',
        ];
    }
    if (cheapShortContour) {
        return [
            `Доля звонков < ${rules.shortCallSec} с — ${input.shortPct} % (> ${rules.shortShareMaxPct} %): ` +
                `глубокий разбор оставить от ${rules.shortCallSec} с, а для коротких завести дешёвый контур ` +
                '(классификатор + краткий разбор: выход на ЛПР, отказ, следующий контакт).',
        ];
    }
    return [
        `Доля звонков < ${rules.shortCallSec} с — ${input.shortPct} % (≤ ${rules.shortShareMaxPct} %): ` +
            `minDurationSec = ${rules.shortCallSec} оставить, отдельный контур для коротких не требуется.`,
    ];
}

/**
 * Правило:
 * - < cellShareMinPct разборов окна в ячейках с n ≥ cellMinN → пороги ниже;
 * - доля коротких > shortShareMaxPct → дешёвый контур для коротких.
 */
export function buildThresholdRecommendation(
    input: ThresholdRecommendationInput,
    rules: AuditRules = AUDIT_RULES,
): ThresholdRecommendation {
    const lowerThresholds =
        input.analyzedInCellsPct !== null &&
        input.analyzedInCellsPct < rules.cellShareMinPct;
    const cheapShortContour =
        input.shortPct !== null && input.shortPct > rules.shortShareMaxPct;
    return {
        lowerThresholds,
        cheapShortContour,
        lines: [
            ...thresholdLines(input, rules, lowerThresholds),
            ...durationLines(input, rules, cheapShortContour),
        ],
    };
}
