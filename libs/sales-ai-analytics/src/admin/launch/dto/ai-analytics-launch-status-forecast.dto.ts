/**
 * Ответ `GET admin/ai-analytics/launch-status`, часть 2: общий блок
 * (состояние и текст), прогноз и расход модели. Переразбор — в
 * `ai-analytics-launch-reanalysis.dto.ts`; настройки, смарт, журнал
 * прогонов и корень ответа — в `ai-analytics-launch-status.dto.ts`
 * (лимит 300 строк на файл).
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_FORECAST_BACKTEST_STATUSES,
    type ForecastBacktestStatus,
} from '../../../model/forecast-backtest.types';
import { LAUNCH_BLOCK_STATES, type LaunchBlockState } from '../launch.const';
import type {
    LaunchBlock,
    LaunchCostBlock,
    LaunchForecastBlock,
} from '../launch.types';

export class AiAnalyticsLaunchBlockDto implements LaunchBlock {
    @ApiProperty({
        description:
            'Состояние шага: done — сделано, todo — нужно сделать, running — ' +
            'идёт, unknown — проверить не удалось.',
        enum: LAUNCH_BLOCK_STATES,
        example: 'todo',
    })
    state: LaunchBlockState;

    @ApiProperty({
        description: 'Что это и что сделать дальше — по-русски, для владельца.',
        example:
            'История за 24 месяца ещё не догонялась — нажмите «Догнать историю».',
        type: String,
    })
    text: string;
}

export class AiAnalyticsLaunchForecastDto
    extends AiAnalyticsLaunchBlockDto
    implements LaunchForecastBlock
{
    @ApiProperty({
        description:
            'Итог последней проверки точности; null — проверки не было.',
        enum: AI_FORECAST_BACKTEST_STATUSES,
        nullable: true,
        example: 'insufficient',
    })
    status: ForecastBacktestStatus | null;

    @ApiProperty({
        description: 'Закрытый месяц проверки (YYYY-MM).',
        type: String,
        nullable: true,
        example: '2026-09',
    })
    monthKey: string | null;

    @ApiProperty({
        description: 'Когда посчитана проверка (ISO, UTC).',
        type: String,
        nullable: true,
        example: '2026-10-02T01:00:00.000Z',
    })
    generatedAt: string | null;

    @ApiProperty({
        description: 'Теневых месяцев (журнал прогноза + факт).',
        type: Number,
        nullable: true,
        example: 7,
    })
    shadowMonths: number | null;

    @ApiProperty({
        description:
            'Сколько теневых месяцев нужно (forecast_shadow_min_months).',
        type: Number,
        nullable: true,
        example: 9,
    })
    shadowMinMonths: number | null;

    @ApiProperty({
        description:
            'Из теневых — восстановлено по истории (forecast-log-replay).',
        type: Number,
        nullable: true,
        example: 6,
    })
    replayedMonths: number | null;

    @ApiProperty({
        description: 'Коды причин проверки.',
        type: [String],
        example: ['not-enough-months'],
    })
    reasons: string[];

    @ApiProperty({
        description: 'Причины словами.',
        type: [String],
        example: ['закрытых месяцев с фактом меньше нужного'],
    })
    reasonTexts: string[];

    @ApiProperty({
        description:
            'Прогноз показывается в отчёте (forecast_stage_enabled); null — ' +
            'JSON настроек модели не разбирается.',
        type: Boolean,
        nullable: true,
        example: false,
    })
    stageEnabled: boolean | null;

    @ApiProperty({
        description:
            'Эффект советов показывается (recommendations_stage_enabled).',
        type: Boolean,
        nullable: true,
        example: false,
    })
    recommendationsStageEnabled: boolean | null;
}

export class AiAnalyticsLaunchCostDto
    extends AiAnalyticsLaunchBlockDto
    implements LaunchCostBlock
{
    @ApiProperty({
        description: 'Месяц расхода (YYYY-MM).',
        type: String,
        example: '2026-10',
    })
    month: string;

    @ApiProperty({
        description: 'Токенов за месяц.',
        type: Number,
        nullable: true,
        example: 3200000,
    })
    tokens: number | null;

    @ApiProperty({
        description:
            'Стоимость, ₽: факт колонок price, без него — оценка по цене реестра.',
        type: Number,
        nullable: true,
        example: 800,
    })
    price: number | null;

    @ApiProperty({
        description: 'Стоимость — оценка, а не факт.',
        type: Boolean,
        nullable: true,
        example: true,
    })
    estimated: boolean | null;
}
