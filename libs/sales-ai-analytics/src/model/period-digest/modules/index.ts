import {
    DIGEST_RECOMMENDATION_CODE,
    DigestRecommendationCode,
} from '../period-digest.codes';
import type { DigestModule } from './digest-module.types';
import { followupObjectionsModule } from './followup-objections.module';
import { followupStepDateModule } from './followup-step-date.module';
import { lowScoreCallsModule } from './low-score-calls.module';
import { nextStepDatedModule } from './next-step-dated.module';
import { presentationFitModule } from './presentation-fit.module';
import { presentationNeedsModule } from './presentation-needs.module';
import { presentationSpiralsModule } from './presentation-spirals.module';
import { worstSectionModule } from './worst-section.module';

export * from './digest-module.types';
export {
    DIGEST_FORMS,
    DIGEST_SECTION,
    digestHitsOf,
    digestPercent,
} from './digest-module.util';

/** Модуль по коду рекомендации — у каждого кода свой модуль. */
export const DIGEST_MODULE_BY_CODE: Readonly<
    Record<DigestRecommendationCode, DigestModule>
> = {
    [DIGEST_RECOMMENDATION_CODE.presentationNeeds]: presentationNeedsModule,
    [DIGEST_RECOMMENDATION_CODE.presentationFit]: presentationFitModule,
    [DIGEST_RECOMMENDATION_CODE.presentationSpirals]: presentationSpiralsModule,
    [DIGEST_RECOMMENDATION_CODE.followupObjections]: followupObjectionsModule,
    [DIGEST_RECOMMENDATION_CODE.followupStepDate]: followupStepDateModule,
    [DIGEST_RECOMMENDATION_CODE.nextStepDated]: nextStepDatedModule,
    [DIGEST_RECOMMENDATION_CODE.lowScoreCalls]: lowScoreCallsModule,
    [DIGEST_RECOMMENDATION_CODE.worstSection]: worstSectionModule,
};

/**
 * Модули в порядке приоритета (решение владельца 19.10.2026): сначала
 * презентации, затем доработка, шаг с датой и слабые звонки. Худший раздел
 * — запасной: только когда эти молчат.
 */
export const DIGEST_PRIMARY_MODULES: readonly DigestModule[] = [
    presentationNeedsModule,
    presentationFitModule,
    presentationSpiralsModule,
    followupObjectionsModule,
    followupStepDateModule,
    nextStepDatedModule,
    lowScoreCallsModule,
];
export const DIGEST_FALLBACK_MODULE: DigestModule = worstSectionModule;

export const digestModuleOf = (code: DigestRecommendationCode): DigestModule =>
    DIGEST_MODULE_BY_CODE[code];
