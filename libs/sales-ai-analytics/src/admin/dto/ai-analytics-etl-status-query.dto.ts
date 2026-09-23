/**
 * Запрос ручки `GET admin/ai-analytics/etl-status` (план Фазы 3, П5).
 * Отдельный файл от ответа — по лимиту 300 строк: классы ответа (прогон,
 * шаг, сводка) живут в `ai-analytics-etl-status.dto.ts`.
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

/** Границы и умолчание окна ручки. */
export const AI_ANALYTICS_ETL_STATUS_DEFAULTS = {
    days: 7,
    minDays: 1,
    maxDays: 90,
} as const;

/** Запрос состояния конвейера по домену. */
export class AiAnalyticsEtlStatusQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, чьи прогоны смотрим.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    domain: string;

    @ApiPropertyOptional({
        description:
            'Глубина окна в днях (1–90): журналы прогонов за последние ' +
            'days суток. По умолчанию 7 — неделя ночных прогонов.',
        example: AI_ANALYTICS_ETL_STATUS_DEFAULTS.days,
        type: Number,
        minimum: AI_ANALYTICS_ETL_STATUS_DEFAULTS.minDays,
        maximum: AI_ANALYTICS_ETL_STATUS_DEFAULTS.maxDays,
        default: AI_ANALYTICS_ETL_STATUS_DEFAULTS.days,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'days должно быть целым числом' })
    @Min(AI_ANALYTICS_ETL_STATUS_DEFAULTS.minDays)
    @Max(AI_ANALYTICS_ETL_STATUS_DEFAULTS.maxDays)
    days?: number;
}
