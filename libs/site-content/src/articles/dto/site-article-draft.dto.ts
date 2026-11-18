import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
    Min,
} from 'class-validator';
import { IsObjectArray } from '@lib/core/decorators/dto/object-array.decorator';
import {
    SITE_ARTICLE_CONTENT_FORMATS,
    SITE_ARTICLE_DRAFT_SOURCES,
    SITE_ARTICLE_LIMITS,
    type SiteArticleContentFormat,
    type SiteArticleDraftSource,
} from '../domain/site-article.const';
import type { SiteArticleBlock } from '../domain/site-article-content.parse';
import type { SiteArticleDraftCommand } from '../services/site-article-drafts.service';
import { SiteArticleIdParamsDto } from './site-article.dto';

const LIMITS = SITE_ARTICLE_LIMITS;

export const SITE_ARTICLE_BLOCKS_SCHEMA = {
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    example: [
        { kind: 'lead', text: 'Зачем разбирать звонки' },
        { kind: 'heading', text: 'Как устроен разбор', id: 'how-it-works' },
        { kind: 'media', slot: 'scr-call-report', aspect: '16:9' },
    ],
} as const;

const EXPECTED_NUMBER_DESCRIPTION =
    'Номер последней версии, которую видел правщик (0 — версий ещё нет). Если за это время появилась более новая версия — 409 «текст уже изменили», чтобы не затереть чужую правку.';

export class SiteArticleRevisionParamsDto extends SiteArticleIdParamsDto {
    @ApiProperty({
        description: 'Id версии статьи (uuid строки site_article_revisions).',
        type: String,
        format: 'uuid',
        example: '4a5d8c1e-3f2b-4f6b-9a7c-91e2d3c4b5a6',
    })
    @IsUUID()
    revisionId!: string;
}

const optionalText = (
    description: string,
    example: string,
    maxLength: number,
) =>
    ApiPropertyOptional({
        description,
        type: String,
        example,
        maxLength,
        nullable: true,
    });

/** Черновик: новая неизменная версия текста статьи. */
export class SiteArticleDraftDto implements SiteArticleDraftCommand {
    @ApiProperty({
        description: EXPECTED_NUMBER_DESCRIPTION,
        type: Number,
        example: 3,
        minimum: 0,
    })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    expectedNumber!: number;

    @ApiPropertyOptional({
        description:
            'Откуда текст: admin — правка в админке, code — взят из кода сайта кнопкой «текст из кода».',
        type: String,
        enum: SITE_ARTICLE_DRAFT_SOURCES,
        example: 'admin',
        default: 'admin',
    })
    @IsOptional()
    @IsString()
    @IsIn(SITE_ARTICLE_DRAFT_SOURCES)
    source?: SiteArticleDraftSource;

    @ApiPropertyOptional({
        description:
            'Формат блоков — каким движком сайта их рисовать. Не передан — формат раздела; другой формат раздела — 400.',
        type: String,
        enum: SITE_ARTICLE_CONTENT_FORMATS,
        example: 'theory-v1',
    })
    @IsOptional()
    @IsString()
    @IsIn(SITE_ARTICLE_CONTENT_FORMATS)
    contentFormat?: SiteArticleContentFormat;

    @optionalText(
        'Надзаголовок-ярлык над заголовком.',
        'AI для отдела продаж',
        LIMITS.eyebrow,
    )
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.eyebrow)
    eyebrow?: string | null;

    @ApiProperty({
        description: 'Заголовок статьи (h1).',
        type: String,
        example: 'Разбор звонка',
        maxLength: LIMITS.title,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(LIMITS.title)
    title!: string;

    @optionalText(
        'Подводка под заголовком; без своих полей для поисковиков идёт и в описание страницы.',
        'Как AI разбирает звонок и что видит руководитель.',
        LIMITS.description,
    )
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.description)
    description?: string | null;

    @optionalText(
        'Заголовок для поисковиков; пусто — берётся заголовок.',
        'Разбор звонков AI — April',
        LIMITS.seoTitle,
    )
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.seoTitle)
    seoTitle?: string | null;

    @optionalText(
        'Описание для поисковиков; пусто — берётся подводка.',
        'Что AI находит в звонке менеджера.',
        LIMITS.seoDescription,
    )
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.seoDescription)
    seoDescription?: string | null;

    @ApiProperty({
        description:
            'Блоки статьи по формату: theory-v1 — вид в поле kind (lead, heading, paragraph, screen, media, table, steps, list, note и др.), how-v1 — вид в поле type. Не больше 400 блоков, строка до 20 000 знаков, весь текст до 512 КБ. Проблемы возвращаются списком в errors ответа 400.',
        ...SITE_ARTICLE_BLOCKS_SCHEMA,
    })
    @IsObjectArray()
    blocks!: SiteArticleBlock[];

    @optionalText(
        'Отпечаток главы из кода сайта, на которой сделана правка: по нему админка видит, что в коде глава обновилась позже.',
        '9f2c4a1b7e3d5c60',
        LIMITS.baseCodeHash,
    )
    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9_-]*$/)
    @MaxLength(LIMITS.baseCodeHash)
    baseCodeHash?: string | null;

    @optionalText(
        'Пометка правщика «что поменял».',
        'Обновил главу о прогнозе',
        LIMITS.comment,
    )
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.comment)
    comment?: string | null;
}

export class SiteArticlePublishDto {
    @ApiProperty({
        description:
            'Какую версию сделать действующей на сайте. Любая версия статьи: так же делается откат к прежней.',
        type: String,
        format: 'uuid',
        example: '4a5d8c1e-3f2b-4f6b-9a7c-91e2d3c4b5a6',
    })
    @IsUUID()
    revisionId!: string;
}

export class SiteArticleRestoreDto {
    @ApiProperty({
        description: EXPECTED_NUMBER_DESCRIPTION,
        type: Number,
        example: 5,
        minimum: 0,
    })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    expectedNumber!: number;

    @optionalText(
        'Пометка к копии; пусто — «Копия версии N».',
        'Вернул текст до правки 12.11',
        LIMITS.comment,
    )
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.comment)
    comment?: string | null;
}
