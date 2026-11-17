import { isFollowupCallType } from '../../attention.sections.util';
import { ruCount } from '../../ru-text.util';
import { nonEmptyText } from '../../sections.util';
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

const ACTION = 'Отвечать на каждое возражение на доработке';

/** Доля возражений без ответа на доработке (типы — по умолчанию якоря). */
const ANCHOR: DigestAnchor = {
    metric: DIGEST_ANCHOR_METRIC.objectionUnhandledShare,
};

/**
 * Доработка: возражения без ответа в доле не ниже порога портала (правило
 * «Внимания» «слабая доработка»). Норма цели — порог с запасом на сдвиг.
 */
export const followupObjectionsModule: DigestModule = {
    code: DIGEST_RECOMMENDATION_CODE.followupObjections,
    detect: context => {
        const facts = context.quality.followup;
        if (facts.objectionsKnown < context.minN) return null;
        const share = facts.objectionsUnhandled / facts.objectionsKnown;
        if (share < context.rules.weakFollowupShareMin) return null;
        const baseline = digestBaselineOf(ANCHOR, context);
        if (!baseline) return null;
        const unhandled = context.rows.filter(
            row =>
                isFollowupCallType(row.callType) &&
                row.objections.some(objection => objection.handled === false),
        );
        const quote =
            unhandled
                .flatMap(row => row.objections)
                .filter(objection => objection.handled === false)
                .map(objection => nonEmptyText(objection.quote))
                .find(Boolean) ?? null;
        return {
            anchor: ANCHOR,
            baseline,
            norm: context.rules.weakFollowupShareMin - context.shift.share,
            comparison: null,
            evidence: digestEvidenceOf(unhandled, quote),
        };
    },
    template: (detection, target) => {
        const { value, n } = detection.baseline;
        return (
            `${ACTION}: без ответа осталось ${digestHitsOf(value, n)} из ` +
            `${ruCount(n, DIGEST_FORMS.objectionsGenitive)} (${digestPercent(value)}), ` +
            `цель — ${formatDigestTarget(detection.anchor, target)}.`
        );
    },
    weekAction: () => ACTION,
};
