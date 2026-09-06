import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    Matches,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    AI_ANALYTICS_MANAGER_LEVELS,
    AiAnalyticsManagerLevel,
} from '../constants/ai-overview.const';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Уровень менеджера, назначенный РОПом. */
export class AiManagerLevelDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера из периметра requester’а.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    managerId: number;

    @ApiProperty({
        description: 'Уровень.',
        enum: AI_ANALYTICS_MANAGER_LEVELS,
        example: 'senior',
    })
    @IsIn(AI_ANALYTICS_MANAGER_LEVELS)
    level: AiAnalyticsManagerLevel;

    @ApiPropertyOptional({
        description:
            'Дата начала стажа (YYYY-MM-DD, не позже сегодня в TZ портала); ' +
            'по ней считается tenureMonths.',
        type: String,
        example: '2025-03-01',
    })
    @IsOptional()
    @Matches(DATE_PATTERN, {
        message: 'since должен быть в формате YYYY-MM-DD',
    })
    since?: string;
}

/**
 * Сохранение настроек витрины (план 6.2, только cup|op). Фаза 1b: только
 * уровни менеджеров; targets/absences появятся вместе с ключами схемы.
 * Список заменяет предыдущий целиком.
 */
export class AiSettingsSaveRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Уровни менеджеров (полный список; пусто — сброс к дефолту).',
        type: [AiManagerLevelDto],
    })
    @IsArray()
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => AiManagerLevelDto)
    levels: AiManagerLevelDto[];
}

export class AiSettingsSaveResultDto {
    @ApiProperty({
        description: 'Id ais-записи настроек (type = ai-analytics-settings).',
        type: String,
        example: '90210',
    })
    id: string;

    @ApiProperty({
        description: 'Сохранённые уровни.',
        type: [AiManagerLevelDto],
    })
    levels: AiManagerLevelDto[];

    @ApiProperty({
        description: 'Момент сохранения (ISO, UTC).',
        type: String,
        example: '2026-09-06T09:00:00.000Z',
    })
    savedAt: string;

    @ApiProperty({
        description: 'Сколько ключей кэша overview/attention домена сброшено.',
        type: Number,
        example: 3,
    })
    resetCount: number;
}

export class AiSettingsSaveResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Итог сохранения (при status = ready).',
        type: AiSettingsSaveResultDto,
    })
    data?: AiSettingsSaveResultDto;
}
