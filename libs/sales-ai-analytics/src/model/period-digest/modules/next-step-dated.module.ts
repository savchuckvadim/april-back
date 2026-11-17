import { ruCount } from '../../ru-text.util';
import { hasDatedNextStep } from '../period-digest.anchors';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_MOVEMENT,
    DIGEST_POSITION,
    DIGEST_RECOMMENDATION_CODE,
} from '../period-digest.codes';
import { digestDeltaOf } from '../period-digest.compare';
import {
    digestStandingTitle,
    formatDigestTarget,
} from '../period-digest.texts';
import type { DigestAnchor, DigestPeriodKind } from '../period-digest.types';
import type { DigestModule } from './digest-module.types';
import {
    DIGEST_FORMS,
    digestEvidenceOf,
    digestHitsOf,
    digestPercent,
} from './digest-module.util';

const ACTION = 'Договариваться о дате следующего контакта';

const ANCHOR: DigestAnchor = {
    metric: DIGEST_ANCHOR_METRIC.nextStepDatedShare,
};

const PREVIOUS_PERIOD_WORD: Readonly<Record<DigestPeriodKind, string>> = {
    week: 'неделей раньше',
    month: 'месяцем раньше',
};

/**
 * Все звонки: доля «шаг с датой» ниже середины отдела на порог сдвига и
 * больше или упала к прошлому периоду на порог и больше. Норма цели —
 * лучшее из середины отдела и прошлого периода.
 */
export const nextStepDatedModule: DigestModule = {
    code: DIGEST_RECOMMENDATION_CODE.nextStepDated,
    detect: context => {
        const current = context.metrics.nextStepDated;
        if (current.value === null || current.n < context.minN) return null;
        const standing = context.standings.nextStepDated;
        const below = standing?.position === DIGEST_POSITION.below;
        const before = context.previous?.nextStepDated ?? null;
        const beforeValue =
            before &&
            digestDeltaOf(before, current, context.shift.share, context.minN)
                .movement === DIGEST_MOVEMENT.down
                ? before.value
                : null;
        if (!below && beforeValue === null) return null;
        const norms = [
            below && standing ? standing.middle : null,
            beforeValue,
        ].filter((value): value is number => value !== null);
        const comparison = [
            below ? digestStandingTitle(standing) : null,
            beforeValue !== null
                ? `${PREVIOUS_PERIOD_WORD[context.kind]} было ${digestPercent(beforeValue)}`
                : null,
        ].filter((part): part is string => part !== null);
        return {
            anchor: ANCHOR,
            baseline: { value: current.value, n: current.n },
            norm: Math.max(...norms),
            comparison: comparison.join(', '),
            evidence: digestEvidenceOf(
                context.rows.filter(row => !hasDatedNextStep(row)),
            ),
        };
    },
    template: (detection, target) => {
        const { value, n } = detection.baseline;
        const facts =
            `дата есть в ${digestHitsOf(value, n)} из ` +
            `${ruCount(n, DIGEST_FORMS.callsGenitive)} (${digestPercent(value)})`;
        return (
            `${ACTION}: ${facts}` +
            `${detection.comparison ? `, ${detection.comparison}` : ''}, ` +
            `цель — ${formatDigestTarget(detection.anchor, target)}.`
        );
    },
    weekAction: () => ACTION,
};
