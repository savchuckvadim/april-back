import type { AiGuideSection } from './ai-guide.types';
import { ENABLE_AND_PUSH_SECTION } from './sections/enable-and-push.section';
import { PEOPLE_AND_TARGETS_SECTION } from './sections/people-and-targets.section';
import { CALL_ANALYSIS_SECTION } from './sections/call-analysis.section';
import { MODEL_AND_DATA_SECTION } from './sections/model-and-data.section';
import { FORECAST_SECTION } from './sections/forecast.section';
import { FEEDBACK_RELIABILITY_SECTION } from './sections/feedback-reliability.section';
import { LAUNCH_AFTER_RELEASE_SECTION } from './sections/launch-after-release.section';

/**
 * Путеводитель по AI-аналитике ОП: порядок массива = порядок оглавления
 * в админке. Разделы — `sections/*.section.ts`, по файлу на раздел.
 */
export const AI_GUIDE_SECTIONS: readonly AiGuideSection[] = [
    ENABLE_AND_PUSH_SECTION,
    PEOPLE_AND_TARGETS_SECTION,
    CALL_ANALYSIS_SECTION,
    MODEL_AND_DATA_SECTION,
    FORECAST_SECTION,
    FEEDBACK_RELIABILITY_SECTION,
    LAUNCH_AFTER_RELEASE_SECTION,
];

export const AI_GUIDE_SECTION_CODES: readonly string[] = AI_GUIDE_SECTIONS.map(
    section => section.code,
);

export function findAiGuideSection(code: string): AiGuideSection | null {
    return AI_GUIDE_SECTIONS.find(section => section.code === code) ?? null;
}
