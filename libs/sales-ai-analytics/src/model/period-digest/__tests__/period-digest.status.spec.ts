import { DIGEST_ANCHOR_METRIC, DIGEST_STATUS } from '../period-digest.codes';
import {
    digestStatusOf,
    digestTargetOf,
    isDigestTargetAchieved,
} from '../period-digest.status';
import type { DigestAnchor } from '../period-digest.types';
import {
    MONTH_OPTIONS as OPTIONS,
    NEEDS_ANCHOR as NEEDS,
} from './digest-recommendation.fixture';

const LOW_SCORE: DigestAnchor = { metric: DIGEST_ANCHOR_METRIC.lowScoreShare };
const SPIRALS: DigestAnchor = {
    metric: DIGEST_ANCHOR_METRIC.spiralsFullMean,
};

describe('статус рекомендации', () => {
    it('сдвиг якоря с порогом и направлением', () => {
        const at = (value: number) => ({ value, n: 6 });
        expect(digestStatusOf(NEEDS, 4, at(4.5), OPTIONS)).toBe(
            DIGEST_STATUS.improved,
        );
        expect(digestStatusOf(NEEDS, 4, at(4.4), OPTIONS)).toBe(
            DIGEST_STATUS.same,
        );
        expect(digestStatusOf(NEEDS, 4, at(3.5), OPTIONS)).toBe(
            DIGEST_STATUS.worse,
        );
        expect(digestStatusOf(LOW_SCORE, 0.4, at(0.3), OPTIONS)).toBe(
            DIGEST_STATUS.improved,
        );
        expect(digestStatusOf(LOW_SCORE, 0.4, at(0.5), OPTIONS)).toBe(
            DIGEST_STATUS.worse,
        );
    });

    it('данных под якорем меньше минимума — «данных мало»', () => {
        expect(digestStatusOf(NEEDS, 4, { value: 9, n: 4 }, OPTIONS)).toBe(
            DIGEST_STATUS.noData,
        );
        expect(digestStatusOf(NEEDS, 4, { value: 9, n: 2 }, { minN: 3 })).toBe(
            DIGEST_STATUS.noData,
        );
        expect(digestStatusOf(NEEDS, null, { value: 9, n: 6 }, OPTIONS)).toBe(
            DIGEST_STATUS.same,
        );
    });

    it('цель достигнута — не хуже цели в сторону лучшего', () => {
        expect(isDigestTargetAchieved(NEEDS, 5, 5)).toBe(true);
        expect(isDigestTargetAchieved(NEEDS, 4.9, 5)).toBe(false);
        expect(isDigestTargetAchieved(NEEDS, null, 5)).toBe(false);
        expect(isDigestTargetAchieved(LOW_SCORE, 0.2, 0.2)).toBe(true);
        expect(isDigestTargetAchieved(LOW_SCORE, 0.25, 0.2)).toBe(false);
    });
});

describe('цель рекомендации', () => {
    it('база плюс два порога сдвига в лучшую сторону', () => {
        expect(digestTargetOf(NEEDS, 4)).toBe(5);
        expect(digestTargetOf(LOW_SCORE, 0.5)).toBeCloseTo(0.3);
        expect(digestTargetOf(SPIRALS, 1)).toBe(2);
    });

    it('норма ближе — цель по норме, если норма лучше базы хотя бы на порог', () => {
        expect(digestTargetOf(NEEDS, 4, { norm: 4.6 })).toBe(4.6);
        expect(digestTargetOf(NEEDS, 4, { norm: 4.3 })).toBe(5);
        expect(digestTargetOf(LOW_SCORE, 0.5, { norm: 0.4 })).toBe(0.4);
        expect(digestTargetOf(SPIRALS, 1, { norm: 1.5 })).toBe(1.5);
    });

    it('цель в границах шкалы', () => {
        expect(digestTargetOf(NEEDS, 9.8)).toBe(10);
        expect(digestTargetOf(LOW_SCORE, 0.15)).toBe(0);
    });

    it('порог сдвига — параметр', () => {
        expect(
            digestTargetOf(NEEDS, 4, {
                shift: { score: 1, share: 0.1, perCall: 0.5 },
            }),
        ).toBe(6);
    });
});
