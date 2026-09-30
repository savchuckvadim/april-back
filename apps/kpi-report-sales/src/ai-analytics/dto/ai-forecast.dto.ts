import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LognormalCheckSource } from '@lib/sales-ai-analytics';
import {
    AI_FORECAST_CHECK_SOURCES,
    AI_FORECAST_MODES,
    type AiForecastMode,
} from '../constants/ai-forecast.const';
import { AiForecastBacktestSummaryDto } from './ai-forecast-backtest.dto';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

export { AiForecastBacktestSummaryDto };

/**
 * Прогноз отдела на месяц (Фаза 4, план §4.8, §10 L4): вилка продаж
 * из теневого журнала `ai-analytics-forecast-log` и сводка проверки
 * точности `ai-analytics-forecast-backtest`. Вилка и деньги отдаются
 * только в режиме published; сводка проверки — всегда (чек-лист
 * готовности показывает, сколько ещё ждать).
 */

/** Запрос прогноза отдела: месяц — текущий в TZ портала. */
export class AiForecastRequestDto extends AiRequestBaseDto {}

/** Вилка прогноза: нижняя граница, середина и верхняя граница. */
export class AiForecastBandDto {
    @ApiProperty({
        description:
            'Нижняя граница вилки (при уровне 0,8 — 10-й процентиль): ' +
            'хуже этого месяц закроется примерно в одном случае из десяти.',
        type: Number,
        example: 38,
    })
    low: number;

    @ApiProperty({
        description: 'Середина вилки — самый ожидаемый итог месяца.',
        type: Number,
        example: 46,
    })
    p50: number;

    @ApiProperty({
        description:
            'Верхняя граница вилки (при уровне 0,8 — 90-й процентиль).',
        type: Number,
        example: 55,
    })
    high: number;
}

/** Теневой режим: сколько месяцев прогноз уже проверяется незаметно. */
export class AiForecastShadowDto {
    @ApiProperty({
        description:
            'Закрытых месяцев с сохранённым дневным прогнозом и фактом.',
        type: Number,
        example: 4,
    })
    monthsLogged: number;

    @ApiProperty({
        description:
            'Сколько таких месяцев нужно до проверки точности ' +
            '(forecast_shadow_min_months).',
        type: Number,
        example: 9,
    })
    minMonths: number;

    @ApiProperty({
        description:
            'Последняя проверка точности на истории; null — ещё не ' +
            'считалась.',
        type: AiForecastBacktestSummaryDto,
        nullable: true,
    })
    backtest: AiForecastBacktestSummaryDto | null;
}

/** Прогноз отдела на текущий месяц. */
export class AiForecastDto {
    @ApiProperty({
        description:
            'Режим: published — вилка проверена на истории, показ ' +
            'включён и готовность портала не ниже «прогноза» (вилки нет, ' +
            'если журнала за месяц ещё нет — появится после ночного ' +
            'расчёта); shadow — прогноз считается, но вилка не отдаётся ' +
            '(причины — в reasons).',
        enum: AI_FORECAST_MODES,
        example: 'shadow',
    })
    mode: AiForecastMode;

    @ApiProperty({
        description: 'Месяц прогноза (YYYY-MM, TZ портала) — текущий.',
        type: String,
        example: '2026-09',
    })
    monthKey: string;

    @ApiProperty({
        description:
            'День последней записи журнала прогноза (YYYY-MM-DD); null — ' +
            'журнала за месяц ещё нет.',
        type: String,
        nullable: true,
        example: '2026-09-28',
    })
    asOf: string | null;

    @ApiProperty({
        description:
            'Уровень вилки (доля, forecast_interval_level); null — ' +
            'журнала нет.',
        type: Number,
        nullable: true,
        example: 0.8,
    })
    level: number | null;

    @ApiProperty({
        description:
            'Вилка продаж месяца по отделу; null в режиме shadow и без ' +
            'журнала за месяц (в том числе при published).',
        type: AiForecastBandDto,
        nullable: true,
    })
    band: AiForecastBandDto | null;

    @ApiProperty({
        description:
            'Та же вилка в рублях по обычному (логнормальному) чеку; null ' +
            'в режиме shadow или когда чека нет.',
        type: AiForecastBandDto,
        nullable: true,
    })
    money: AiForecastBandDto | null;

    @ApiProperty({
        description:
            'Откуда чек для вилки в деньгах: estimated — свой чек портала, ' +
            'shrunk — свой чек, уточнённый по типичному (своих продаж ' +
            'немного), default — чек по умолчанию или из общей статистики ' +
            '(своих продаж меньше минимума); null — журнала нет или запись ' +
            'старая, без источника.',
        enum: AI_FORECAST_CHECK_SOURCES,
        nullable: true,
        example: 'estimated',
    })
    checkSource: LognormalCheckSource | null;

    @ApiProperty({
        description:
            'Продаж отдела с начала месяца на день журнала; null — ' +
            'журнала нет.',
        type: Number,
        nullable: true,
        example: 21,
    })
    done: number | null;

    @ApiProperty({
        description:
            'Простой прогноз по темпу дня (для сравнения); null — ' +
            'журнала нет.',
        type: Number,
        nullable: true,
        example: 44,
    })
    naive: number | null;

    @ApiProperty({
        description:
            'Среднее продаж трёх прошлых месяцев (для сравнения); null — ' +
            'истории нет.',
        type: Number,
        nullable: true,
        example: 41.3,
    })
    mean3: number | null;

    @ApiProperty({
        description:
            'Теневой режим и проверка точности — отдаются всегда, в том ' +
            'числе при published.',
        type: AiForecastShadowDto,
    })
    shadow: AiForecastShadowDto;

    @ApiProperty({
        description:
            'Коды причин режима shadow (подписи — на фронте): ' +
            'forecast-shadow-months-below-{N} (теневых месяцев меньше N), ' +
            'forecast-backtest-insufficient, forecast-coverage-outside, ' +
            'forecast-mase-not-below, forecast-log-missing (нет ни ' +
            'проверки, ни журнала — прогноз ещё не начал копиться), ' +
            'forecast-stage-disabled (только когда проверка пройдена, а ' +
            'показ выключен), forecast-readiness-below (проверка пройдена ' +
            'и показ включён, но готовность портала ниже «прогноза»). ' +
            'Пусто — режим published.',
        type: [String],
        example: [
            'forecast-shadow-months-below-9',
            'forecast-backtest-insufficient',
        ],
    })
    reasons: string[];
}

export class AiForecastResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Прогноз отдела (при status = ready).',
        type: AiForecastDto,
    })
    data?: AiForecastDto;
}
