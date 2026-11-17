import { sectionTitleOf } from '../../dictionary-titles.util';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_POSITION,
    DIGEST_RECOMMENDATION_CODE,
} from '../period-digest.codes';
import {
    digestStandingTitle,
    formatDigestTarget,
} from '../period-digest.texts';
import type { DigestAnchor } from '../period-digest.types';
import type { DigestModule } from './digest-module.types';
import {
    DIGEST_FORMS,
    digestBaselineOf,
    digestSectionEvidence,
    digestSectionNumbers,
} from './digest-module.util';

const actionOf = (anchor: DigestAnchor): string =>
    `Подтянуть раздел «${sectionTitleOf(anchor.section ?? '')}»`;

/**
 * Запасной модуль (работает, когда модули 1–7 молчат): худший раздел
 * периода по всем звонкам ниже середины отдела. Норма цели — середина.
 */
export const worstSectionModule: DigestModule = {
    code: DIGEST_RECOMMENDATION_CODE.worstSection,
    detect: context => {
        const section = context.metrics.worstSection;
        const stat = context.metrics.sections.find(
            item => item.section === section,
        );
        const standing = stat?.standing ?? null;
        if (!section || standing?.position !== DIGEST_POSITION.below) {
            return null;
        }
        const anchor: DigestAnchor = {
            metric: DIGEST_ANCHOR_METRIC.sectionMean,
            section,
        };
        const baseline = digestBaselineOf(anchor, context);
        if (!baseline) return null;
        return {
            anchor,
            baseline,
            norm: standing.middle,
            comparison: digestStandingTitle(standing),
            evidence: digestSectionEvidence(anchor, context.rows, null),
        };
    },
    template: (detection, target) =>
        `${actionOf(detection.anchor)}: ` +
        `${digestSectionNumbers(detection, DIGEST_FORMS.callsDative)}, ` +
        `цель — ${formatDigestTarget(detection.anchor, target)}.`,
    weekAction: actionOf,
};
