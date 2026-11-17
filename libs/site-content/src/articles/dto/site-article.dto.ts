import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    SITE_ARTICLE_SECTIONS,
    SITE_ARTICLE_SLUG_MAX_LENGTH,
    SITE_ARTICLE_STATUSES,
    SITE_ARTICLE_TYPES,
    type SiteArticleSection,
    type SiteArticleStatus,
    type SiteArticleType,
} from '../domain/site-article.const';
import type { SiteArticleMeta } from '../domain/site-article-props';
import type {
    SiteArticleCreateCommand,
    SiteArticleEnsureCommand,
    SiteArticleUpdateCommand,
} from '../services/site-articles.service';

/** Порядок в перечне раздела — колонка INT. */
const SORT_LIMIT = 1_000_000;

export const SITE_ARTICLE_SECTION_DESCRIPTION =
    'Раздел сайта: ai — «AI для ОП», process-sales — теория процесса продаж, articles — открытый список статей, how-we-work — «Как мы работаем» (зарезервирован).';

const SLUG_DESCRIPTION =
    'Адрес статьи внутри раздела: латиница в нижнем регистре, цифры, дефисы, части через «/», до 191 знака. Пустой адрес — обзорная глава раздела (хранится как index).';

export const SITE_ARTICLE_META_SCHEMA = {
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { tags: ['kpi', 'ропу'], audience: 'rop' },
} as const;

const META_DESCRIPTION =
    'Дополнительные свойства статьи без своей колонки: метки, «для кого статья» и т. п. Объект JSON до 16 КБ, виден на сайте всем.';

export class SiteArticleIdParamsDto {
    @ApiProperty({
        description: 'Id статьи (uuid строки site_articles).',
        type: String,
        format: 'uuid',
        example: '8c1e3f2b-4a5d-4f6b-9a7c-2d3c4b5a691e',
    })
    @IsUUID()
    id!: string;
}

export class SiteArticleListQueryDto {
    @ApiPropertyOptional({
        description: `Фильтр по разделу. ${SITE_ARTICLE_SECTION_DESCRIPTION}`,
        type: String,
        enum: SITE_ARTICLE_SECTIONS,
        example: 'ai',
    })
    @IsOptional()
    @IsString()
    @IsIn(SITE_ARTICLE_SECTIONS)
    section?: SiteArticleSection;

    @ApiPropertyOptional({
        description:
            'Фильтр по типу: глава из кода, статья, инструкция, новость, кейс.',
        type: String,
        enum: SITE_ARTICLE_TYPES,
        example: 'chapter',
    })
    @IsOptional()
    @IsString()
    @IsIn(SITE_ARTICLE_TYPES)
    type?: SiteArticleType;

    @ApiPropertyOptional({
        description:
            'Фильтр по статусу: черновик, опубликована, снята, в архиве.',
        type: String,
        enum: SITE_ARTICLE_STATUSES,
        example: 'published',
    })
    @IsOptional()
    @IsString()
    @IsIn(SITE_ARTICLE_STATUSES)
    status?: SiteArticleStatus;
}

export class SiteArticleCreateDto implements SiteArticleCreateCommand {
    @ApiProperty({
        description: `Раздел новой статьи — только открытый список (articles). ${SITE_ARTICLE_SECTION_DESCRIPTION}`,
        type: String,
        enum: SITE_ARTICLE_SECTIONS,
        example: 'articles',
    })
    @IsString()
    @IsIn(SITE_ARTICLE_SECTIONS)
    section!: SiteArticleSection;

    @ApiProperty({
        description:
            'Тип статьи; «chapter» (глава из кода) здесь не создаётся — для глав есть ensure.',
        type: String,
        enum: SITE_ARTICLE_TYPES,
        example: 'news',
    })
    @IsString()
    @IsIn(SITE_ARTICLE_TYPES)
    type!: SiteArticleType;

    @ApiProperty({
        description: SLUG_DESCRIPTION,
        type: String,
        example: 'news/kpi-pulse',
        maxLength: SITE_ARTICLE_SLUG_MAX_LENGTH,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(SITE_ARTICLE_SLUG_MAX_LENGTH)
    slug!: string;

    @ApiPropertyOptional({
        description: 'Порядок в перечне раздела: меньше — выше.',
        type: Number,
        example: 500,
        default: 500,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(-SORT_LIMIT)
    @Max(SORT_LIMIT)
    sort?: number;

    @ApiPropertyOptional({
        description: META_DESCRIPTION,
        ...SITE_ARTICLE_META_SCHEMA,
    })
    @IsOptional()
    @IsObject()
    meta?: SiteArticleMeta | null;
}

export class SiteArticleEnsureDto implements SiteArticleEnsureCommand {
    @ApiProperty({
        description: `Раздел с главами в коде сайта (ai, process-sales). ${SITE_ARTICLE_SECTION_DESCRIPTION}`,
        type: String,
        enum: SITE_ARTICLE_SECTIONS,
        example: 'ai',
    })
    @IsString()
    @IsIn(SITE_ARTICLE_SECTIONS)
    section!: SiteArticleSection;

    @ApiProperty({
        description: `${SLUG_DESCRIPTION} Должен совпадать с адресом главы в коде сайта.`,
        type: String,
        example: 'theory/call-analysis',
        maxLength: SITE_ARTICLE_SLUG_MAX_LENGTH,
    })
    @IsString()
    @MaxLength(SITE_ARTICLE_SLUG_MAX_LENGTH)
    slug!: string;
}

export class SiteArticleUpdateDto implements SiteArticleUpdateCommand {
    @ApiPropertyOptional({
        description:
            'Порядок в перечне раздела: меньше — выше. Меняется всегда.',
        type: Number,
        example: 100,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(-SORT_LIMIT)
    @Max(SORT_LIMIT)
    sort?: number;

    @ApiPropertyOptional({
        description:
            'Тип статьи — только до первой публикации; «глава» не меняется ни туда, ни обратно.',
        type: String,
        enum: SITE_ARTICLE_TYPES,
        example: 'guide',
    })
    @IsOptional()
    @IsString()
    @IsIn(SITE_ARTICLE_TYPES)
    type?: SiteArticleType;

    @ApiPropertyOptional({
        description: `${SLUG_DESCRIPTION} Меняется только до первой публикации: на опубликованный адрес уже могут вести ссылки.`,
        type: String,
        example: 'news/kpi',
        maxLength: SITE_ARTICLE_SLUG_MAX_LENGTH,
    })
    @IsOptional()
    @IsString()
    @MaxLength(SITE_ARTICLE_SLUG_MAX_LENGTH)
    slug?: string;

    @ApiPropertyOptional({
        description: `${META_DESCRIPTION} null — снять все свойства; не передано — без изменений.`,
        ...SITE_ARTICLE_META_SCHEMA,
    })
    @IsOptional()
    @IsObject()
    meta?: SiteArticleMeta | null;
}
