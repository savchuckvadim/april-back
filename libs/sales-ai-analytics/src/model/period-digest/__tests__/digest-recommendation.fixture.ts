import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_RECOMMENDATION_CODE,
    DIGEST_TEXT_SOURCE,
    DigestRecommendationCode,
} from '../period-digest.codes';
import {
    evaluateDigestRecommendation,
    newDigestRecommendation,
} from '../period-digest.status';
import type {
    DigestAnchor,
    DigestRecommendation,
} from '../period-digest.types';

/** Якорь «Выявление потребностей» на презентациях: оценка, больше — лучше. */
export const NEEDS_ANCHOR: DigestAnchor = {
    metric: DIGEST_ANCHOR_METRIC.sectionMean,
    section: 'NEEDS',
    callTypes: ['presentation'],
};

/** Минимум наблюдений месяца. */
export const MONTH_OPTIONS = { minN: 5 };

/** Рекомендация, выданная за октябрь 2026: база 4 (n = 6), цель 5. */
export const issueRecommendation = (
    patch: {
        code?: DigestRecommendationCode;
        baseline?: number;
        target?: number;
    } = {},
): DigestRecommendation =>
    newDigestRecommendation({
        code: patch.code ?? DIGEST_RECOMMENDATION_CODE.presentationNeeds,
        text: 'Задавать вопросы о задачах клиента до показа',
        source: DIGEST_TEXT_SOURCE.template,
        anchor: NEEDS_ANCHOR,
        periodKey: '2026-10',
        baseline: { value: patch.baseline ?? 4, n: 6 },
        target: patch.target ?? 5,
        evidence: { transcriptionIds: ['t1'], quote: null },
    });

const NEXT_MONTHS = ['2026-11', '2026-12', '2027-01'] as const;

/** Оценки подряд по месяцам ноябрь, декабрь, январь; null — данных нет. */
export const evaluateMonths = (
    recommendation: DigestRecommendation,
    values: readonly (number | null)[],
): DigestRecommendation =>
    values.reduce<DigestRecommendation>(
        (current, value, index) =>
            evaluateDigestRecommendation(
                current,
                value === null ? { value: null, n: 0 } : { value, n: 6 },
                NEXT_MONTHS[index],
                MONTH_OPTIONS,
            ),
        recommendation,
    );
