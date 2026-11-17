import { isFollowupCallType } from '../../attention.sections.util';
import { ruCount } from '../../ru-text.util';
import { hasDatedNextStep } from '../period-digest.anchors';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_RECOMMENDATION_CODE,
} from '../period-digest.codes';
import { formatDigestTarget } from '../period-digest.texts';
import type { DigestAnchor } from '../period-digest.types';
import type { DigestModule } from './digest-module.types';
import {
    DIGEST_FORMS,
    digestBaselineOf,
    digestEvidenceOf,
    digestHitsOf,
    digestPercent,
} from './digest-module.util';

const ACTION = 'Завершать каждую доработку датой следующего шага';

/** Доля шагов без даты на доработке (типы — по умолчанию якоря). */
const ANCHOR: DigestAnchor = {
    metric: DIGEST_ANCHOR_METRIC.followupStepNoDateShare,
};

/**
 * Доработка: следующий шаг назначен без даты в доле не ниже порога портала
 * (правило «Внимания» «слабая доработка»). Норма цели — порог с запасом.
 */
export const followupStepDateModule: DigestModule = {
    code: DIGEST_RECOMMENDATION_CODE.followupStepDate,
    detect: context => {
        const facts = context.quality.followup;
        if (facts.nextStepSet < context.minN) return null;
        const share = facts.nextStepNoDate / facts.nextStepSet;
        if (share < context.rules.weakFollowupShareMin) return null;
        const baseline = digestBaselineOf(ANCHOR, context);
        if (!baseline) return null;
        return {
            anchor: ANCHOR,
            baseline,
            norm: context.rules.weakFollowupShareMin - context.shift.share,
            comparison: null,
            evidence: digestEvidenceOf(
                context.rows.filter(
                    row =>
                        isFollowupCallType(row.callType) &&
                        row.nextStep?.set === true &&
                        !hasDatedNextStep(row),
                ),
            ),
        };
    },
    template: (detection, target) => {
        const { value, n } = detection.baseline;
        return (
            `${ACTION}: без даты ${digestHitsOf(value, n)} из ` +
            `${ruCount(n, DIGEST_FORMS.stepsGenitive)} (${digestPercent(value)}), ` +
            `цель — ${formatDigestTarget(detection.anchor, target)}.`
        );
    },
    weekAction: () => ACTION,
};
