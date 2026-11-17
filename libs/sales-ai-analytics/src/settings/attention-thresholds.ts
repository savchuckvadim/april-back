/**
 * Пороги сигналов «Внимания» этапа 2 из настроек портала: коды реестра
 * `weak_section_score_max`, `weak_section_gap`, `low_score_call_max`,
 * `weak_followup_share_min`, а с 02.11.2026 и пороги методики
 * `quality_progress_score_min`, `deal_progress_moving_min`,
 * `progress_no_quality_min_calls` со слоем портала (`ai_analytics_model_params`);
 * значение вне диапазона реестр сам откатывает к дефолту. Одни и те же
 * числа читают сборка обзора, повестка планёрки и подбор «трёх звонков
 * недели», а с 17.11.2026 — итоги периода по менеджерам в event-sales
 * (переехал из apps/kpi-report-sales/…/loaders/attention-thresholds.util.ts,
 * старый путь — реэкспорт).
 */
import type { AttentionThresholds } from '../model/quality-facts.types';
import { registryDefault } from '../params/registry.access';
import { resolveNumberParam } from '../params/resolve';
import {
    buildRegistryContext,
    type RegistryContextInput,
} from './registry-context.builder';

/** Слои настроек портала, из которых читаются пороги (без менеджера). */
export type AttentionThresholdSettings = Pick<
    RegistryContextInput,
    'modelParams' | 'definitions' | 'targets'
>;

/** Дефолты реестра — когда настроек портала под рукой нет. */
export const defaultAttentionThresholds = (): AttentionThresholds => ({
    weakSectionScoreMax: registryDefault('weak_section_score_max'),
    weakSectionGap: registryDefault('weak_section_gap'),
    lowScoreCallMax: registryDefault('low_score_call_max'),
    weakFollowupShareMin: registryDefault('weak_followup_share_min'),
    qualityScoreMin: registryDefault('quality_progress_score_min'),
    progressMovingMin: registryDefault('deal_progress_moving_min'),
    progressNoQualityMinCalls: registryDefault('progress_no_quality_min_calls'),
});

/** Пороги по слою портала; значения вне диапазона реестр откатывает к дефолту. */
export function attentionThresholdsOf(
    settings: AttentionThresholdSettings,
): AttentionThresholds {
    const ctx = buildRegistryContext({
        modelParams: settings.modelParams,
        definitions: settings.definitions,
        targets: settings.targets,
    });
    const defaults = defaultAttentionThresholds();
    return {
        weakSectionScoreMax:
            resolveNumberParam('weak_section_score_max', ctx) ??
            defaults.weakSectionScoreMax,
        weakSectionGap:
            resolveNumberParam('weak_section_gap', ctx) ??
            defaults.weakSectionGap,
        lowScoreCallMax:
            resolveNumberParam('low_score_call_max', ctx) ??
            defaults.lowScoreCallMax,
        weakFollowupShareMin:
            resolveNumberParam('weak_followup_share_min', ctx) ??
            defaults.weakFollowupShareMin,
        qualityScoreMin:
            resolveNumberParam('quality_progress_score_min', ctx) ??
            defaults.qualityScoreMin,
        progressMovingMin:
            resolveNumberParam('deal_progress_moving_min', ctx) ??
            defaults.progressMovingMin,
        progressNoQualityMinCalls:
            resolveNumberParam('progress_no_quality_min_calls', ctx) ??
            defaults.progressNoQualityMinCalls,
    };
}
