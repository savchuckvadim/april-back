import { weakSpiralsOf } from '../../attention.rules.methodology';
import { ruCount, ruDecimal } from '../../ru-text.util';
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
} from './digest-module.util';

const ACTION =
    'Проходить спираль до конца — потребность, свойство, связка, выгода, вопрос';

/** Полных спиралей в среднем на презентацию (типы — по умолчанию якоря). */
const ANCHOR: DigestAnchor = { metric: DIGEST_ANCHOR_METRIC.spiralsFullMean };

/**
 * Презентации, методика со спиралями: полных спиралей в среднем меньше
 * нормы методики (правило «Внимания» weakSpiralsOf). Норма цели — норма
 * методики из самого свежего разбора.
 */
export const presentationSpiralsModule: DigestModule = {
    code: DIGEST_RECOMMENDATION_CODE.presentationSpirals,
    detect: context => {
        const spirals = context.quality.presentation.spirals;
        const weak = weakSpiralsOf(spirals, context.rules);
        if (!weak || !spirals) return null;
        const baseline = digestBaselineOf(ANCHOR, context);
        if (!baseline) return null;
        const below = new Set(spirals.belowMinCallIds);
        return {
            anchor: ANCHOR,
            baseline,
            norm: spirals.minFull,
            comparison: `при норме ${spirals.minFull}`,
            evidence: digestEvidenceOf(
                context.rows.filter(row => below.has(row.transcriptionId)),
            ),
        };
    },
    template: (detection, target) =>
        `${ACTION}: в среднем ${ruDecimal(detection.baseline.value)} полной ` +
        `спирали на презентацию по ` +
        `${ruCount(detection.baseline.n, DIGEST_FORMS.presentationsDative)}` +
        `${detection.comparison ? ` ${detection.comparison}` : ''}, ` +
        `цель — ${formatDigestTarget(detection.anchor, target)}.`,
    weekAction: () => ACTION,
};
