/**
 * Эффект советов — прокси гейта L5 (план §10: «каузальная приёмка на
 * одном портале недостижима … прокси — доля выполненных рекомендаций и
 * before/after КП/счетов с Уилсоном; Goodhart-контроль»; §4.10 «доля
 * „не согласен“ по типу совета < порога»). Фаза 4, поток П18.
 *
 * Правило `pass`:
 * 1. советов с закрытым окном «после» ≥ `recommendations_min_issued`
 *    и выданных ≥ `n_min_none` — иначе `insufficient`;
 * 2. нижняя граница 90 %-интервала Уилсона доли выполненных
 *    ≥ `recommendations_done_share_min`;
 * 3. верхняя граница интервала доли несогласий < `recommendations_disagree_max`
 *    — берётся неблагоприятная граница, как и у доли выполненных: при
 *    малом n широкий интервал честно не пускает ступень, а не точечная
 *    доля «0 из 6»;
 * 4. хотя бы у одного ребра нижняя граница разности «после − до» > 0;
 * 5. у детектора Гудхарта приложения нет флагов (если вход передан).
 *
 * Это прокси, не причинность: сезон и смена цели месяца в «после» не
 * вычищаются (план §10 это оговаривает). Тексты — в презентере.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`, `Math.random`.
 */
import { registryDefault, registryRangeOf } from '../params/registry.access';
import type { AiAnalyticsParamCode } from '../params/registry.const';
import { AI_LEVERS } from './lever.types';
import {
    aggregateBeforeAfter,
    countIssued,
    shareWithInterval,
    sortIssued,
} from './recommendation-effect.aggregate';
import {
    RECOMMENDATION_INSUFFICIENT_REASONS,
    type EdgeBeforeAfter,
    type GoodhartCleanInput,
    type IssuedRecommendation,
    type LeverEffect,
    type RecommendationEffect,
    type RecommendationEffectInput,
    type RecommendationEffectParams,
    type RecommendationEffectResolvedParams,
    type RecommendationGate,
    type RecommendationGateReason,
    type ShareWithInterval,
} from './recommendation-effect.types';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/**
 * Коды реестра по каждому параметру оценки — единственное место, где они
 * записаны литералом (спека phase2-invariants проверяет их наличие).
 */
export const RECOMMENDATION_EFFECT_PARAM_CODES = {
    minIssued: 'recommendations_min_issued' satisfies AiAnalyticsParamCode,
    doneShareMin:
        'recommendations_done_share_min' satisfies AiAnalyticsParamCode,
    disagreeMax: 'recommendations_disagree_max' satisfies AiAnalyticsParamCode,
    minN: 'n_min_none' satisfies AiAnalyticsParamCode,
    z: 'z_compare' satisfies AiAnalyticsParamCode,
} as const satisfies Record<
    keyof RecommendationEffectResolvedParams,
    AiAnalyticsParamCode
>;

/** Дефолты оценки эффекта — все из реестра (план §10 L5). */
export const RECOMMENDATION_EFFECT_DEFAULTS = {
    /** `recommendations_min_issued`. */
    minIssued: registryDefault(RECOMMENDATION_EFFECT_PARAM_CODES.minIssued),
    /** `recommendations_done_share_min`. */
    doneShareMin: registryDefault(
        RECOMMENDATION_EFFECT_PARAM_CODES.doneShareMin,
    ),
    /** `recommendations_disagree_max`. */
    disagreeMax: registryDefault(RECOMMENDATION_EFFECT_PARAM_CODES.disagreeMax),
    /** `n_min_none`. */
    minN: registryDefault(RECOMMENDATION_EFFECT_PARAM_CODES.minN),
    /** `z_compare` (через общие пороги модели). */
    z: AI_ANALYTICS_THRESHOLDS.z90,
} as const satisfies RecommendationEffectResolvedParams;

/** Число из параметров либо дефолт при отсутствии/нечисле. */
const numberOr = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) ? value : fallback;

/**
 * Значение параметра: переданное число либо дефолт, обрезанное по диапазону
 * кода реестра (без диапазона — как есть).
 */
const resolveOne = (
    key: keyof RecommendationEffectResolvedParams,
    value: number | undefined,
): number => {
    const code = RECOMMENDATION_EFFECT_PARAM_CODES[key];
    const resolved = numberOr(value, RECOMMENDATION_EFFECT_DEFAULTS[key]);
    const range = registryRangeOf(code);

    return range ? Math.min(range[1], Math.max(range[0], resolved)) : resolved;
};

/** Параметры с подстановкой дефолтов реестра и обрезкой по диапазонам. */
export function resolveRecommendationEffectParams(
    params: RecommendationEffectParams | undefined,
): RecommendationEffectResolvedParams {
    return {
        minIssued: resolveOne('minIssued', params?.minIssued),
        doneShareMin: resolveOne('doneShareMin', params?.doneShareMin),
        disagreeMax: resolveOne('disagreeMax', params?.disagreeMax),
        minN: resolveOne('minN', params?.minN),
        z: resolveOne('z', params?.z),
    };
}

/**
 * Goodhart-контроль чист: детектор приложения не поднял ни одного флага.
 * Отрицательные и нечисловые счётчики считаются нулём.
 */
export function goodhartClean(input: GoodhartCleanInput): boolean {
    const flags = Number.isFinite(input.flags) ? input.flags : 0;
    const managers = Number.isFinite(input.managersWithFlags)
        ? input.managersWithFlags
        : 0;

    return flags <= 0 && managers <= 0;
}

/** Хотя бы у одного ребра нижняя граница «после − до» выше нуля. */
export const hasPositiveEdge = (
    beforeAfter: readonly EdgeBeforeAfter[],
): boolean => beforeAfter.some(edge => edge.ci90 !== null && edge.ci90[0] > 0);

interface GateInput {
    readonly completedWindows: number;
    readonly doneShare: ShareWithInterval;
    readonly disagreeShare: ShareWithInterval;
    readonly beforeAfter: readonly EdgeBeforeAfter[];
    readonly goodhart: GoodhartCleanInput | undefined;
    readonly params: RecommendationEffectResolvedParams;
}

const isInsufficientReason = (reason: RecommendationGateReason): boolean =>
    RECOMMENDATION_INSUFFICIENT_REASONS.some(item => item === reason);

/** Гейт L5 по правилу из шапки файла; причины — в фиксированном порядке. */
export function recommendationGate(input: GateInput): RecommendationGate {
    const reasons: RecommendationGateReason[] = [];
    if (input.completedWindows < input.params.minIssued) {
        reasons.push('issued-below-min');
    }
    if (input.doneShare.ci90 === null || input.disagreeShare.ci90 === null) {
        reasons.push('issued-below-n-min');
    }
    if (
        input.doneShare.ci90 !== null &&
        input.doneShare.ci90[0] < input.params.doneShareMin
    ) {
        reasons.push('done-share-below');
    }
    if (
        input.disagreeShare.ci90 !== null &&
        input.disagreeShare.ci90[1] >= input.params.disagreeMax
    ) {
        reasons.push('disagree-above');
    }
    if (!hasPositiveEdge(input.beforeAfter)) {
        reasons.push('no-positive-edge');
    }
    if (input.goodhart !== undefined && !goodhartClean(input.goodhart)) {
        reasons.push('goodhart-flags');
    }
    const status = reasons.some(isInsufficientReason)
        ? 'insufficient'
        : reasons.length > 0
          ? 'fail'
          : 'pass';

    return { status, reasons };
}

/** Свод по одному рычагу на уже отсортированном подмножестве советов. */
function leverEffectOf(
    lever: LeverEffect['lever'],
    sorted: readonly IssuedRecommendation[],
    params: RecommendationEffectResolvedParams,
): LeverEffect {
    const counts = countIssued(sorted);

    return {
        lever,
        issued: counts.issued,
        completedWindows: counts.completedWindows,
        done: counts.done,
        disagree: counts.disagree,
        doneShare: shareWithInterval(
            counts.done,
            counts.issued,
            params.minN,
            params.z,
        ),
        disagreeShare: shareWithInterval(
            counts.disagree,
            counts.issued,
            params.minN,
            params.z,
        ),
        beforeAfter: aggregateBeforeAfter(sorted, params.z, params.minN),
    };
}

/**
 * Оценка эффекта советов за окно: доли выполненных и несогласий по всем
 * выданным (Уилсон), «после − до» по рёбрам по советам с закрытым окном
 * (Ньюкомб), своды по рычагам и гейт L5. Детерминирована: советы
 * сортируются по менеджеру, месяцу и ключу, рёбра — по коду.
 */
export function buildRecommendationEffect(
    input: RecommendationEffectInput,
): RecommendationEffect {
    const params = resolveRecommendationEffectParams(input.params);
    const sorted = sortIssued(input.issued);
    const counts = countIssued(sorted);
    const doneShare = shareWithInterval(
        counts.done,
        counts.issued,
        params.minN,
        params.z,
    );
    const disagreeShare = shareWithInterval(
        counts.disagree,
        counts.issued,
        params.minN,
        params.z,
    );
    const beforeAfter = aggregateBeforeAfter(sorted, params.z, params.minN);
    const byLever = AI_LEVERS.flatMap(lever => {
        const own = sorted.filter(item => item.lever === lever);

        return own.length > 0 ? [leverEffectOf(lever, own, params)] : [];
    });

    return {
        issued: counts.issued,
        completedWindows: counts.completedWindows,
        done: counts.done,
        disagree: counts.disagree,
        doneShare,
        disagreeShare,
        byLever,
        beforeAfter,
        gate: recommendationGate({
            completedWindows: counts.completedWindows,
            doneShare,
            disagreeShare,
            beforeAfter,
            goodhart: input.goodhart,
            params,
        }),
        params,
    };
}
