import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { AiEntityDto } from './ai-entity.dto';

/** Пределы страницы списка AI-записей админки. */
export const AI_ADMIN_PAGE = {
    defaultPageSize: 50,
    maxPageSize: 200,
} as const;

/** Запрос страницы AI-записей: номер, размер и необязательные фильтры. */
export class AiAdminPageQueryDto {
    @ApiPropertyOptional({
        description: 'Номер страницы, начиная с 1.',
        type: Number,
        example: 1,
        minimum: 1,
        default: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        description: `Записей на странице (1–${AI_ADMIN_PAGE.maxPageSize}).`,
        type: Number,
        example: AI_ADMIN_PAGE.defaultPageSize,
        minimum: 1,
        maximum: AI_ADMIN_PAGE.maxPageSize,
        default: AI_ADMIN_PAGE.defaultPageSize,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(AI_ADMIN_PAGE.maxPageSize)
    pageSize?: number;

    @ApiPropertyOptional({
        description: 'Домен портала Битрикс24 — только его записи.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    domain?: string;

    @ApiPropertyOptional({
        description: 'Тип записи (поле type) — только записи этого типа.',
        type: String,
        example: 'agent-analysis',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    type?: string;
}

/** Страница AI-записей: свежие первыми и общее число под фильтром. */
export class AiAdminPageDto {
    @ApiProperty({
        description: 'Записи страницы, свежие первыми (по id).',
        type: [AiEntityDto],
    })
    items: AiEntityDto[];

    @ApiProperty({
        description: 'Всего записей под фильтром.',
        type: Number,
        example: 1234,
    })
    total: number;

    @ApiProperty({ description: 'Номер страницы.', type: Number, example: 1 })
    page: number;

    @ApiProperty({
        description: 'Записей на странице.',
        type: Number,
        example: AI_ADMIN_PAGE.defaultPageSize,
    })
    pageSize: number;
}
