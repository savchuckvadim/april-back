import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';

/**
 * Точечный сброс кэша эфирного времени — «на всякий случай», чтобы
 * следующий запрос честно пересчитал данные из Bitrix.
 * Комбинации фильтров:
 *   { domain }                    — все ячейки портала
 *   { domain, month }             — месяц по всем сотрудникам
 *   { domain, userIds }           — все месяцы указанных сотрудников
 *   { domain, userIds, month }    — точечные ячейки
 */
export class AirtimeCacheResetRequestDto {
    @ApiProperty({ description: 'Домен портала Bitrix24' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description: 'Календарный месяц yyyy-MM (например 2026-06)',
        example: '2026-06',
    })
    @IsOptional()
    @Matches(/^\d{4}-\d{2}$/, {
        message: 'month должен быть в формате yyyy-MM',
    })
    month?: string;

    @ApiPropertyOptional({
        description: 'ID сотрудников Bitrix; не указаны — все',
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @Type(() => Number)
    @IsInt({ each: true })
    userIds?: number[];
}

export class AirtimeCacheResetResponseDto {
    @ApiProperty({ description: 'Удалено строк в БД (app_cache)' })
    deletedDb: number;

    @ApiProperty({ description: 'Удалено ключей в Redis' })
    deletedRedis: number;
}
