import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyzeDealCallsDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, на котором находится сделка.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'ID сделки в Bitrix24, чьи звонки нужно проанализировать.',
        type: Number,
        example: 34792,
        minimum: 1,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiPropertyOptional({
        description: 'Сколько последних звонков обработать. По умолчанию 3.',
        type: Number,
        example: 3,
        minimum: 1,
        default: 3,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;
}

export class AnalyzeActivityDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description:
            'ID активности-звонка в Bitrix24, которую нужно проанализировать.',
        type: Number,
        example: 893310,
        minimum: 1,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    activityId: number;

    @ApiProperty({
        description:
            'ID сделки в Bitrix24, к которой относится активность (нужен чтобы сохранить результат в таймлайн сделки).',
        type: Number,
        example: 34792,
        minimum: 1,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    dealId: number;
}
