import { ATTENTION_PRESENTATION_CALL_TYPES } from '../../attention.sections.util';
import { DIGEST_RECOMMENDATION_CODE } from '../period-digest.codes';
import { formatDigestTarget } from '../period-digest.texts';
import type { DigestModule } from './digest-module.types';
import {
    DIGEST_FORMS,
    DIGEST_SECTION,
    detectWeakSection,
    digestSectionFacts,
} from './digest-module.util';

const ACTION = 'Выяснять задачи клиента до показа';

/**
 * Презентации: слаб раздел «Выявление потребностей» (правило «Внимания»
 * «слабые презентации»). Якорь — средняя раздела на презентациях.
 */
export const presentationNeedsModule: DigestModule = {
    code: DIGEST_RECOMMENDATION_CODE.presentationNeeds,
    detect: context =>
        detectWeakSection(
            context,
            DIGEST_SECTION.needs,
            context.quality.presentation.sections,
            ATTENTION_PRESENTATION_CALL_TYPES,
        ),
    template: (detection, target) =>
        `${ACTION}: ${digestSectionFacts(detection, DIGEST_FORMS.presentationsDative)}, ` +
        `цель — ${formatDigestTarget(detection.anchor, target)}.`,
    weekAction: () => ACTION,
};
