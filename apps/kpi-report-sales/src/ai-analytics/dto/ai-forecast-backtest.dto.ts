import { ApiProperty } from '@nestjs/swagger';
import {
    AI_FORECAST_BACKTEST_STATUSES,
    type ForecastBacktestStatus,
} from '@lib/sales-ai-analytics';

/**
 * Сводка проверки прогноза отдела на истории (Фаза 4, план §10 L4) —
 * часть ответа `POST ai-analytics/forecast`. Вынесена из
 * `ai-forecast.dto.ts` по лимиту 300 строк; реэкспортируется оттуда.
 */

/** Сводка проверки прогноза на истории (для чек-листа готовности). */
export class AiForecastBacktestSummaryDto {
    @ApiProperty({
        description: 'Закрытый месяц (YYYY-MM), по который считалась проверка.',
        type: String,
        example: '2026-08',
    })
    monthKey: string;

    @ApiProperty({
        description:
            'Итог проверки: pass — прогноз точнее простых и факт ' +
            'попадает в вилку как задумано; fail — нет; insufficient — ' +
            'данных для проверки мало.',
        enum: AI_FORECAST_BACKTEST_STATUSES,
        example: 'insufficient',
    })
    status: ForecastBacktestStatus;

    @ApiProperty({
        description:
            'Доля дней, когда факт месяца попал в вилку; null — ' +
            'проверять не на чем.',
        type: Number,
        nullable: true,
        example: 0.78,
    })
    coverageShare: number | null;

    @ApiProperty({
        description:
            'Интервал доли попаданий (90 %, Уилсон): [нижняя, верхняя]; ' +
            'null — проверять не на чем.',
        type: [Number],
        nullable: true,
        example: [0.7, 0.85],
    })
    coverageCi90: number[] | null;

    @ApiProperty({
        description: 'Целевая доля попаданий (forecast_coverage_target).',
        type: Number,
        nullable: true,
        example: 0.8,
    })
    coverageTarget: number | null;

    @ApiProperty({
        description:
            'Отношение ошибки прогноза к ошибке простого прогноза «по ' +
            'темпу с начала месяца» (сделанное, растянутое на весь месяц; ' +
            'в первый рабочий день — факт прошлого месяца), меньше 1 — ' +
            'прогноз точнее; null — не определено.',
        type: Number,
        nullable: true,
        example: 0.82,
    })
    maseNaive: number | null;

    @ApiProperty({
        description:
            'Отношение ошибки прогноза к ошибке «среднего за три ' +
            'месяца» (меньше 1 — прогноз точнее); null — не определено.',
        type: Number,
        nullable: true,
        example: 0.9,
    })
    maseMean3: number | null;

    @ApiProperty({
        description:
            'Порог отношения ошибок (forecast_mase_max): верхняя граница ' +
            'интервала должна быть ниже; null — проверять не на чем.',
        type: Number,
        nullable: true,
        example: 1,
    })
    maseMax: number | null;

    @ApiProperty({
        description: 'Закрытых месяцев, вошедших в проверку.',
        type: Number,
        example: 6,
    })
    months: number;

    @ApiProperty({
        description: 'Дней с прогнозом, вошедших в проверку.',
        type: Number,
        example: 132,
    })
    days: number;
}
