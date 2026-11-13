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
import { AdminFacetValueDto } from '../../admin-list/admin-facet.dto';

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

    @ApiPropertyOptional({
        description: 'Поставщик модели, как записан в базе.',
        type: String,
        example: 'vibecode',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    provider?: string;

    @ApiPropertyOptional({
        description: 'Статус записи.',
        type: String,
        example: 'done',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    status?: string;

    @ApiPropertyOptional({
        description: 'Id сотрудника в Битриксе — только его записи.',
        type: String,
        example: '447',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    userId?: string;

    @ApiPropertyOptional({
        description: 'Тип сущности CRM (deal, lead, company…).',
        type: String,
        example: 'deal',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    entityType?: string;

    @ApiPropertyOptional({
        description:
            'Поиск по имени сотрудника, названию сущности, id сущности или id дела. По тексту результата не ищет: это слишком медленно для общего списка.',
        type: String,
        example: 'Ромашка',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    search?: string;
}

/** Значения для фильтров списка AI-записей. */
export class AiAdminFacetsDto {
    @ApiProperty({
        description: 'Порталы: сначала с большим числом записей.',
        type: [AdminFacetValueDto],
    })
    domains: AdminFacetValueDto[];

    @ApiProperty({ description: 'Типы записей.', type: [AdminFacetValueDto] })
    types: AdminFacetValueDto[];

    @ApiProperty({
        description: 'Поставщики моделей.',
        type: [AdminFacetValueDto],
    })
    providers: AdminFacetValueDto[];

    @ApiProperty({ description: 'Статусы.', type: [AdminFacetValueDto] })
    statuses: AdminFacetValueDto[];
}

/** Страница AI-записей: свежие первыми и общее число под фильтром. */
export class AiAdminPageDto {
    @ApiProperty({
        description:
            'Записи страницы, свежие первыми (по id). Длинные поля укорочены до 300 знаков, user_result не отдаётся — целиком запись открывается по id.',
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
