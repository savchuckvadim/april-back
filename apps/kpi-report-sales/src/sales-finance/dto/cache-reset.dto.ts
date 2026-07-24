import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
    SALES_FINANCE_CACHE_SCOPES,
    SalesFinanceCacheScope,
} from '../constants/sales-finance.const';

/**
 * Запрос сброса кэша финансовой аналитики по домену.
 */
export class SalesFinanceCacheResetRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, чей кэш нужно сбросить.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Область сброса: closed — только закрытые продажи, hot — только ' +
            'горячие клиенты, all — весь кэш модуля по домену.',
        enum: SALES_FINANCE_CACHE_SCOPES,
        default: 'all',
        example: 'all',
    })
    @IsOptional()
    @IsIn(SALES_FINANCE_CACHE_SCOPES)
    scope?: SalesFinanceCacheScope;
}

/**
 * Результат сброса кэша.
 */
export class SalesFinanceCacheResetResponseDto {
    @ApiProperty({
        description: 'Сколько ключей кэша удалено.',
        type: Number,
        example: 8,
    })
    deletedCount: number;

    @ApiProperty({
        description: 'SCAN-паттерн ключей, по которому прошла очистка.',
        type: String,
        example: 'sales-finance:april.bitrix24.ru:*',
    })
    pattern: string;
}
