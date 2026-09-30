/**
 * Ответ админ-ручки `GET admin/ai-analytics/forecast-backtest` (Фаза 4,
 * поток B3): проверки точности прогноза отдела по закрытым месяцам —
 * покрытие вилки, отношение ошибок к простым прогнозам, pinball.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_FORECAST_BACKTEST_STATUSES,
    type ForecastBacktestStatus,
} from '../../model/forecast-backtest.types';
import type {
    Phase4BacktestView,
    Phase4ForecastBacktest,
} from '../services/ai-analytics-phase4.types';

export class AiAnalyticsForecastBacktestDto implements Phase4BacktestView {
    @ApiProperty({
        description: 'Закрытый месяц проверки (YYYY-MM).',
        example: '2026-08',
        type: String,
    })
    monthKey: string;

    @ApiProperty({
        description: 'Момент формирования (ISO, UTC).',
        example: '2026-09-03T01:00:00.000Z',
        type: String,
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Итог гейта L4: pass, fail или insufficient.',
        enum: AI_FORECAST_BACKTEST_STATUSES,
        example: 'insufficient',
    })
    status: ForecastBacktestStatus;

    @ApiProperty({
        description: 'Коды причин бэктеста.',
        example: ['not-enough-months'],
        type: [String],
    })
    reasons: string[];

    @ApiProperty({
        description: 'Закрытых месяцев с журналом и фактом.',
        example: 4,
        type: Number,
    })
    shadowMonths: number;

    @ApiProperty({
        description:
            'Сколько теневых месяцев нужно (forecast_shadow_min_months).',
        example: 9,
        type: Number,
    })
    shadowMinMonths: number;

    @ApiProperty({
        description: 'Месяцев в проверке; 0 — журналов с фактом нет.',
        example: 4,
        type: Number,
    })
    months: number;

    @ApiProperty({
        description: 'Дней-прогнозов в проверке.',
        example: 88,
        type: Number,
    })
    days: number;

    @ApiProperty({
        description:
            'Доля дней с фактом внутри вилки; null — проверять не на чем.',
        example: 0.78,
        type: Number,
        nullable: true,
    })
    coverageShare: number | null;

    @ApiProperty({
        description: 'Интервал доли попаданий 90 % (Уилсон).',
        example: [0.7, 0.85],
        type: [Number],
        nullable: true,
    })
    coverageCi90: number[] | null;

    @ApiProperty({
        description: 'Целевое покрытие (forecast_coverage_target).',
        example: 0.8,
        type: Number,
        nullable: true,
    })
    coverageTarget: number | null;

    @ApiProperty({
        description:
            'Отношение ошибок к простому прогнозу «по темпу с начала месяца».',
        example: 0.82,
        type: Number,
        nullable: true,
    })
    maseNaive: number | null;

    @ApiProperty({
        description:
            'Интервал отношения ошибок к «по темпу с начала месяца» (бутстрап).',
        example: [0.7, 0.95],
        type: [Number],
        nullable: true,
    })
    maseNaiveCi90: number[] | null;

    @ApiProperty({
        description: 'Отношение ошибок к «среднему за три месяца».',
        example: 0.9,
        type: Number,
        nullable: true,
    })
    maseMean3: number | null;

    @ApiProperty({
        description: 'Интервал отношения ошибок к «среднему за три месяца».',
        example: [0.75, 1.02],
        type: [Number],
        nullable: true,
    })
    maseMean3Ci90: number[] | null;

    @ApiProperty({
        description: 'Порог отношения ошибок (forecast_mase_max).',
        example: 1,
        type: Number,
        nullable: true,
    })
    maseMax: number | null;

    @ApiProperty({
        description: 'Средний pinball по границам вилки.',
        example: 1.4,
        type: Number,
        nullable: true,
    })
    pinballMean: number | null;
}

export class AiAnalyticsForecastBacktestResultDto
    implements Phase4ForecastBacktest
{
    @ApiProperty({
        description: 'Домен портала запроса.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Сколько месяцев запрошено.',
        example: 6,
        type: Number,
    })
    months: number;

    @ApiProperty({
        description: 'Проверки по закрытым месяцам, свежие первыми.',
        type: [AiAnalyticsForecastBacktestDto],
    })
    items: AiAnalyticsForecastBacktestDto[];
}
