/**
 * Запросы админ-ручек Фазы 4 (волна B, поток B3): состояние пула,
 * проверка точности прогноза, эффект советов и связь качества с исходом —
 * все по домену портала. Ответы — в `ai-analytics-phase4-pool.dto.ts` и
 * `ai-analytics-phase4-effect.dto.ts` (лимит 300 строк на файл).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

/** Глубина истории проверок точности прогноза, месяцев. */
export const AI_ANALYTICS_BACKTEST_HISTORY = {
    months: 6,
    minMonths: 1,
    maxMonths: 24,
} as const;

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Запрос по домену портала. */
export class AiAnalyticsPhase4QueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, чьи снапшоты Фазы 4 смотрим.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;
}

/** Запрос истории проверок точности прогноза. */
export class AiAnalyticsForecastBacktestQueryDto extends AiAnalyticsPhase4QueryDto {
    @ApiPropertyOptional({
        description:
            'Сколько последних закрытых месяцев проверки отдать (1–24). ' +
            'По умолчанию 6.',
        example: AI_ANALYTICS_BACKTEST_HISTORY.months,
        type: Number,
        minimum: AI_ANALYTICS_BACKTEST_HISTORY.minMonths,
        maximum: AI_ANALYTICS_BACKTEST_HISTORY.maxMonths,
        default: AI_ANALYTICS_BACKTEST_HISTORY.months,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'months должно быть целым числом' })
    @Min(AI_ANALYTICS_BACKTEST_HISTORY.minMonths)
    @Max(AI_ANALYTICS_BACKTEST_HISTORY.maxMonths)
    months?: number;
}
