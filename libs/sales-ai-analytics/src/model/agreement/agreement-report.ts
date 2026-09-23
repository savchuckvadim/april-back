/**
 * Сводка согласия оценщика по парам разборов «первый − второй прогон»
 * одной версией промпта (Фаза 3, П7) → GoldenReport: по категориальным
 * полям — каппа Коэна и PABAK (для упорядоченных уровней ещё взвешенная),
 * по шкалам — ICC(2,1)/(3,1) и TOST, по возражениям — F1, σ_llm измеренная
 * как sd разностей шкалы балла / √2 (разность двух независимых прогонов
 * несёт двойную дисперсию оценщика). Чистая функция: без DI, Bitrix и
 * Prisma; отбор выборки, повторный прогон и запись в ais — в приложении.
 */
import {
    GoldenCategoryAgreement,
    GoldenObjectionsAgreement,
    GoldenReport,
    GoldenScaleAgreement,
    GoldenSigmaLlm,
} from '../../contracts/golden-report.types';
import {
    AGREEMENT_DEFAULTS,
    CategoryPair,
    KappaWeighting,
    ScalePair,
} from './agreement.types';
import { setF1, setF1ByCode } from './f1';
import { iccOfPairs } from './icc';
import { cohenKappa } from './kappa';
import { differenceStats, pairDifferences, tost } from './tost';

/** Один прогон разбора: категориальные поля, шкалы и коды возражений. */
export interface AgreementRun {
    /** Категориальные поля по кодам (тип звонка, исход…); null — не заполнено. */
    categories: Readonly<Record<string, string | null>>;
    /** Шкалы по кодам (общий балл, разделы рубрики); null — нет оценки. */
    scales: Readonly<Record<string, number | null>>;
    /** Коды возражений, найденных в разборе. */
    objections: readonly string[];
}

/** Пара прогонов одного разбора. */
export interface AgreementPair {
    /** Ключ разбора (transcriptionId). */
    key: string;
    first: AgreementRun;
    second: AgreementRun;
}

export interface AgreementReportInput {
    promptVersion: string;
    pairs: readonly AgreementPair[];
    /** Код шкалы общего балла — по ней измеряется σ_llm. */
    sigmaScale: string;
    /** Уровни упорядоченных категорий по кодам — для них считается взвешенная каппа. */
    ordinalLevels?: Readonly<Record<string, readonly string[]>>;
    /** Взвешивание упорядоченных категорий; по умолчанию линейное. */
    weighting?: Exclude<KappaWeighting, 'none'>;
    /** Граница эквивалентности TOST; по умолчанию `delta_prac_score`. */
    tostBound?: number;
    /** Квантиль TOST; по умолчанию `z_compare`. */
    z?: number;
    /** Квота пар; по умолчанию `retest_budget_calls`. */
    quota?: number;
    /** Ценз пар для измеренной σ_llm; по умолчанию minN `sigma_llm_default`. */
    minPairs?: number;
}

/** Взвешивание упорядоченных категорий по умолчанию (не параметр реестра). */
const DEFAULT_ORDINAL_WEIGHTING: Exclude<KappaWeighting, 'none'> = 'linear';

const isFilled = (value: string | null | undefined): value is string =>
    typeof value === 'string' && value !== '';

const isScore = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Коды полей, встретившиеся хотя бы в одном прогоне, по алфавиту. */
function codesOf(
    pairs: readonly AgreementPair[],
    pick: (run: AgreementRun) => Readonly<Record<string, unknown>>,
): string[] {
    const codes = new Set<string>();
    for (const pair of pairs) {
        Object.keys(pick(pair.first)).forEach(code => codes.add(code));
        Object.keys(pick(pair.second)).forEach(code => codes.add(code));
    }
    return [...codes].sort((a, b) => a.localeCompare(b));
}

/** Пары значений категории, заполненной обоими прогонами. */
export function categoryPairsOf(
    pairs: readonly AgreementPair[],
    code: string,
): CategoryPair[] {
    const out: CategoryPair[] = [];
    for (const pair of pairs) {
        const first = pair.first.categories[code];
        const second = pair.second.categories[code];
        if (isFilled(first) && isFilled(second)) {
            out.push({ first, second });
        }
    }
    return out;
}

/** Пары значений шкалы, оценённой обоими прогонами. */
export function scalePairsOf(
    pairs: readonly AgreementPair[],
    code: string,
): ScalePair[] {
    const out: ScalePair[] = [];
    for (const pair of pairs) {
        const first = pair.first.scales[code];
        const second = pair.second.scales[code];
        if (isScore(first) && isScore(second)) {
            out.push({ first, second });
        }
    }
    return out;
}

function categoryAgreement(
    input: AgreementReportInput,
    code: string,
): GoldenCategoryAgreement {
    const levels = input.ordinalLevels?.[code];
    const values = categoryPairsOf(input.pairs, code);
    const nominal = cohenKappa(values, { levels });
    const weighted =
        levels && levels.length > 0
            ? cohenKappa(values, {
                  levels,
                  weighting: input.weighting ?? DEFAULT_ORDINAL_WEIGHTING,
              })
            : null;
    return { code, n: nominal.n, nominal, weighted };
}

/** sd разностей / √2 — шум одного прогона; меньше двух пар → null. */
export function sigmaOfPairs(pairs: readonly ScalePair[]): number | null {
    const stats = differenceStats(pairDifferences(pairs));
    return stats !== null && stats.n >= 2 ? stats.sd / Math.SQRT2 : null;
}

function scaleAgreement(
    input: AgreementReportInput,
    code: string,
): GoldenScaleAgreement {
    const values = scalePairsOf(input.pairs, code);
    return {
        code,
        n: values.length,
        icc: iccOfPairs(values),
        tost: tost(pairDifferences(values), {
            bound: input.tostBound ?? AGREEMENT_DEFAULTS.tostBound,
            z: input.z ?? AGREEMENT_DEFAULTS.z,
        }),
        sigma: sigmaOfPairs(values),
    };
}

function objectionsAgreement(
    pairs: readonly AgreementPair[],
): GoldenObjectionsAgreement {
    const sets = pairs.map(pair => ({
        first: pair.first.objections,
        second: pair.second.objections,
    }));
    return {
        pairsWithObjections: sets.filter(
            set => set.first.length > 0 || set.second.length > 0,
        ).length,
        micro: setF1(sets),
        byCode: setF1ByCode(sets),
    };
}

function sigmaLlmOf(input: AgreementReportInput): GoldenSigmaLlm {
    const values = scalePairsOf(input.pairs, input.sigmaScale);
    const measured = sigmaOfPairs(values);
    const minPairs = input.minPairs ?? AGREEMENT_DEFAULTS.minPairs;
    const configured = AGREEMENT_DEFAULTS.sigmaLlmConfigured;
    const passed = measured !== null && values.length >= minPairs;
    return {
        scale: input.sigmaScale,
        measured,
        n: values.length,
        minPairs,
        configured,
        source: passed ? 'measured' : 'configured',
        value: passed ? measured : configured,
    };
}

/**
 * Отчёт согласия по парам: категории, шкалы и возражения обходятся по
 * кодам, встретившимся хотя бы в одном прогоне; поле без второй оценки в
 * паре просто не входит в n этого поля. Идентичные прогоны дают κ = 1,
 * ICC = 1, σ = 0, F1 = 1.
 */
export function buildGoldenReport(input: AgreementReportInput): GoldenReport {
    const quota = input.quota ?? AGREEMENT_DEFAULTS.retestBudgetCalls;
    return {
        promptVersion: input.promptVersion,
        pairs: input.pairs.length,
        budget: { quota, withinQuota: input.pairs.length <= quota },
        categories: codesOf(input.pairs, run => run.categories).map(code =>
            categoryAgreement(input, code),
        ),
        scales: codesOf(input.pairs, run => run.scales).map(code =>
            scaleAgreement(input, code),
        ),
        objections: objectionsAgreement(input.pairs),
        sigmaLlm: sigmaLlmOf(input),
    };
}
