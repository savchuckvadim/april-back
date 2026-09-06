import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsTimeZone,
    Max,
    Min,
} from 'class-validator';

/** Границы и умолчания запроса аудита из админки. */
export const AI_ANALYTICS_AUDIT_RUN_DEFAULTS = {
    months: 6,
    minMonths: 1,
    maxMonths: 24,
    timeZone: 'Europe/Moscow',
    save: true,
} as const;

/** Запуск аудита данных AI-аналитики по живой БД (только SUPER_USER). */
export class AiAnalyticsAuditRunDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, по которому считается аудит.',
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    domain: string;

    @ApiPropertyOptional({
        description:
            'Сколько последних календарных месяцев взять в окно (текущий ' +
            'включительно), 1–24. По умолчанию 6.',
        example: AI_ANALYTICS_AUDIT_RUN_DEFAULTS.months,
        minimum: AI_ANALYTICS_AUDIT_RUN_DEFAULTS.minMonths,
        maximum: AI_ANALYTICS_AUDIT_RUN_DEFAULTS.maxMonths,
    })
    @IsOptional()
    @IsInt({ message: 'months должно быть целым числом' })
    @Min(AI_ANALYTICS_AUDIT_RUN_DEFAULTS.minMonths)
    @Max(AI_ANALYTICS_AUDIT_RUN_DEFAULTS.maxMonths)
    months?: number;

    @ApiPropertyOptional({
        description:
            'Часовой пояс портала (IANA): границы месяцев и дата отчёта. ' +
            'По умолчанию Europe/Moscow.',
        example: AI_ANALYTICS_AUDIT_RUN_DEFAULTS.timeZone,
    })
    @IsOptional()
    @IsTimeZone({ message: 'timeZone должен быть валидным IANA-поясом' })
    timeZone?: string;

    @ApiPropertyOptional({
        description:
            'Сохранить результат снапшотом в ais (type = ai-analytics-audit, ' +
            'source = admin). По умолчанию true; false — только посчитать.',
        example: AI_ANALYTICS_AUDIT_RUN_DEFAULTS.save,
    })
    @IsOptional()
    @IsBoolean({ message: 'save должно быть булевым' })
    save?: boolean;
}
