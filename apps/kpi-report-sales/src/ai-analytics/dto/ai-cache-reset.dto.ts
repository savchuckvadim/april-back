import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
    AI_ANALYTICS_CACHE_SCOPES,
    AiAnalyticsCacheScope,
} from '../constants/ai-analytics.const';
import { AiRequestBaseDto } from './ai-request-base.dto';

/** Сброс кэша AI-аналитики по домену (только руководители cup|op). */
export class AiCacheResetRequestDto extends AiRequestBaseDto {
    @ApiPropertyOptional({
        description:
            'Область сброса: pulse — пульс, agenda — повестка, settings — ' +
            'настройки/готовность, all (по умолчанию) — весь кэш модуля по домену ' +
            '(включая периметры доступа).',
        enum: AI_ANALYTICS_CACHE_SCOPES,
        default: 'all',
        example: 'all',
    })
    @IsOptional()
    @IsIn(AI_ANALYTICS_CACHE_SCOPES)
    scope?: AiAnalyticsCacheScope;
}

export class AiCacheResetResponseDto {
    @ApiProperty({
        description: 'Сколько ключей кэша удалено.',
        type: Number,
        example: 3,
    })
    deletedCount: number;

    @ApiProperty({
        description: 'SCAN-паттерн ключей, по которому прошла очистка.',
        type: String,
        example: 'sales-ai-analytics:v1:april.bitrix24.ru:*',
    })
    pattern: string;
}
