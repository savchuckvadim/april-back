import { ruCount, ruDecimal } from '../../ru-text.util';
import { DIGEST_EVIDENCE_MAX } from '../period-digest.thresholds';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_RECOMMENDATION_CODE,
} from '../period-digest.codes';
import { DIGEST_ZERO_TARGET, formatDigestTarget } from '../period-digest.texts';
import type { DigestAnchor } from '../period-digest.types';
import type { DigestModule } from './digest-module.types';
import {
    DIGEST_FORMS,
    digestBaselineOf,
    digestHitsOf,
    digestPercent,
} from './digest-module.util';

const ACTION = 'Разобрать с руководителем звонки с низкой оценкой';

const ANCHOR: DigestAnchor = { metric: DIGEST_ANCHOR_METRIC.lowScoreShare };

/**
 * Звонки с общей оценкой не выше порога портала (правило «Внимания»
 * «звонки с низкой оценкой»). Рекомендация — только когда таких не меньше
 * порога сдвига доли: иначе улучшение нечем измерить. Примеры — худшие.
 */
export const lowScoreCallsModule: DigestModule = {
    code: DIGEST_RECOMMENDATION_CODE.lowScoreCalls,
    detect: context => {
        const calls = context.quality.lowScoreCalls;
        if (calls.length === 0) return null;
        const baseline = digestBaselineOf(ANCHOR, context);
        if (!baseline || baseline.value < context.shift.share) return null;
        const worst = [...calls].sort(
            (a, b) =>
                a.score - b.score ||
                a.transcriptionId.localeCompare(b.transcriptionId),
        );
        return {
            anchor: ANCHOR,
            baseline,
            norm: null,
            comparison: null,
            evidence: {
                transcriptionIds: worst
                    .slice(0, DIGEST_EVIDENCE_MAX)
                    .map(call => call.transcriptionId),
                quote: null,
            },
        };
    },
    template: (detection, target, context) => {
        const { value, n } = detection.baseline;
        const goal =
            target <= DIGEST_ZERO_TARGET
                ? 'ни одного такого звонка'
                : formatDigestTarget(detection.anchor, target);
        return (
            `${ACTION}: оценка не выше ${ruDecimal(context.rules.lowScoreCallMax, 0)} ` +
            `из 10 у ${digestHitsOf(value, n)} из ` +
            `${ruCount(n, DIGEST_FORMS.callsGenitive)} (${digestPercent(value)}), ` +
            `цель — ${goal}.`
        );
    },
    weekAction: () =>
        'Разбирать с руководителем каждый звонок с низкой оценкой',
};
