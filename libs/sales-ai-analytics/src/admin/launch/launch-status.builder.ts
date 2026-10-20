/**
 * Сборка сводки «Запуск AI после выкладки» — чистая функция над тем, что
 * прочитал `AiAnalyticsLaunchStatusService`. Каждое чтение могло упасть
 * само по себе: такой блок получает state = unknown с текстом ошибки,
 * остальные собираются как обычно (панель не гаснет из-за одного сбоя).
 */
import {
    pipelineBlock,
    settingsBlock,
    smartBlock,
} from './launch-status.blocks';
import {
    costBlock,
    forecastBlock,
    reanalysisBlock,
} from './launch-status.forecast-blocks';
import type { LaunchStatus, LaunchStatusInput } from './launch.types';

export function buildLaunchStatus(input: LaunchStatusInput): LaunchStatus {
    return {
        domain: input.domain,
        checkedAt: input.now.toISOString(),
        settings: settingsBlock(input),
        smart: smartBlock(input),
        pipeline: pipelineBlock(input),
        forecast: forecastBlock(input),
        reanalysis: reanalysisBlock(input),
        cost: costBlock(input),
    };
}
