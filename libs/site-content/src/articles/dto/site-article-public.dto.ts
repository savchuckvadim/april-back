import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SiteMediaPublicDto } from '../../library/dto/site-media-public.dto';
import {
    SITE_ARTICLE_CONTENT_FORMATS,
    SITE_ARTICLE_SECTIONS,
    SITE_ARTICLE_SLUG_MAX_LENGTH,
    SITE_ARTICLE_TYPES,
    type SiteArticleContentFormat,
    type SiteArticleSection,
    type SiteArticleType,
} from '../domain/site-article.const';
import type { SiteArticleBlock } from '../domain/site-article-content.parse';
import type { SiteArticleMeta } from '../domain/site-article-props';
import type {
    SiteArticlePublicListItem,
    SiteArticlePublicMedia,
    SiteArticlePublicView,
} from '../domain/site-article-public.view';
import type { SiteArticleRevisionContent } from '../domain/site-article.types';
import {
    SITE_ARTICLE_META_SCHEMA,
    SITE_ARTICLE_SECTION_DESCRIPTION,
} from './site-article.dto';
import { SITE_ARTICLE_BLOCKS_SCHEMA } from './site-article-draft.dto';
import { isoOrNull } from './site-article-view.dto';

const nullableText = (description: string, example: string) =>
    ApiProperty({ description, type: String, example, nullable: true });

export class SiteArticlePublicSectionParamsDto {
    @ApiProperty({
        description: SITE_ARTICLE_SECTION_DESCRIPTION,
        type: String,
        enum: SITE_ARTICLE_SECTIONS,
        example: 'ai',
    })
    @IsString()
    @IsIn(SITE_ARTICLE_SECTIONS)
    section!: SiteArticleSection;
}

export class SiteArticlePublicQueryDto {
    @ApiProperty({
        description:
            'Адрес статьи внутри раздела, как в адресе страницы сайта; пусто — обзорная глава раздела.',
        type: String,
        example: 'theory/call-analysis',
        required: false,
        maxLength: SITE_ARTICLE_SLUG_MAX_LENGTH,
    })
    @IsOptional()
    @IsString()
    @MaxLength(SITE_ARTICLE_SLUG_MAX_LENGTH)
    slug?: string;
}

export class SiteArticlePublicContentDto implements SiteArticleRevisionContent {
    @ApiProperty({
        description: 'Формат блоков — каким движком сайта рисовать.',
        type: String,
        enum: SITE_ARTICLE_CONTENT_FORMATS,
        example: 'theory-v1',
    })
    contentFormat!: SiteArticleContentFormat;

    @nullableText('Надзаголовок.', 'AI для отдела продаж')
    eyebrow!: string | null;

    @ApiProperty({
        description: 'Заголовок (h1).',
        type: String,
        example: 'Разбор звонка',
    })
    title!: string;

    @nullableText('Подводка под заголовком.', 'Как AI разбирает звонок.')
    description!: string | null;

    @nullableText(
        'Заголовок для поисковиков; null — заголовок.',
        'Разбор звонков AI — April',
    )
    seoTitle!: string | null;

    @nullableText(
        'Описание для поисковиков; null — подводка.',
        'Что AI находит в звонке.',
    )
    seoDescription!: string | null;

    @ApiProperty({
        description:
            'Блоки статьи; сайт проверяет их своими договорённостями и при проблеме показывает текст из кода.',
        ...SITE_ARTICLE_BLOCKS_SCHEMA,
    })
    blocks!: SiteArticleBlock[];
}

@ApiExtraModels(SiteMediaPublicDto)
export class SiteArticlePublicMediaDto implements SiteArticlePublicMedia {
    @ApiProperty({
        description: 'Обложка; null — нет.',
        type: SiteMediaPublicDto,
        nullable: true,
    })
    cover!: SiteMediaPublicDto | null;

    @ApiProperty({
        description:
            'Медиа мест в тексте: id блока-скрина или блока media → медиа. Места без медиа в словаре нет.',
        type: 'object',
        additionalProperties: { $ref: getSchemaPath(SiteMediaPublicDto) },
        example: {},
    })
    slots!: Record<string, SiteMediaPublicDto>;

    @ApiProperty({
        description: 'Галерея по порядку.',
        type: [SiteMediaPublicDto],
    })
    gallery!: SiteMediaPublicDto[];
}

export class SiteArticlePublicDto
    implements Omit<SiteArticlePublicView, 'publishedAt'>
{
    @ApiProperty({
        description: 'Раздел сайта.',
        type: String,
        enum: SITE_ARTICLE_SECTIONS,
        example: 'ai',
    })
    section!: SiteArticleSection;

    @ApiProperty({
        description: 'Адрес внутри раздела; обзорная глава — index.',
        type: String,
        example: 'theory/call-analysis',
    })
    slug!: string;

    @ApiProperty({
        description: 'Тип статьи.',
        type: String,
        enum: SITE_ARTICLE_TYPES,
        example: 'chapter',
    })
    type!: SiteArticleType;

    @ApiProperty({
        description: 'Дополнительные свойства статьи; null — нет.',
        ...SITE_ARTICLE_META_SCHEMA,
    })
    meta!: SiteArticleMeta | null;

    @ApiProperty({
        description:
            'Когда опубликована действующая версия; null — текста в базе нет.',
        type: String,
        format: 'date-time',
        example: '2026-11-18T12:00:00.000Z',
        nullable: true,
    })
    publishedAt!: string | null;

    @ApiProperty({
        description:
            'Опубликованный текст; null — показать текст главы из кода сайта (у статей без кода такого ответа нет — 404).',
        type: SiteArticlePublicContentDto,
        nullable: true,
    })
    content!: SiteArticlePublicContentDto | null;

    @ApiProperty({
        description:
            'Медиа статьи по местам — и для текста из кода, и для текста из базы.',
        type: SiteArticlePublicMediaDto,
    })
    media!: SiteArticlePublicMediaDto;

    static from(view: SiteArticlePublicView): SiteArticlePublicDto {
        return { ...view, publishedAt: isoOrNull(view.publishedAt) };
    }
}

export class SiteArticlePublicListItemDto
    implements Omit<SiteArticlePublicListItem, 'publishedAt'>
{
    @ApiProperty({
        description: 'Адрес внутри раздела.',
        type: String,
        example: 'news/kpi-pulse',
    })
    slug!: string;

    @ApiProperty({
        description: 'Тип статьи.',
        type: String,
        enum: SITE_ARTICLE_TYPES,
        example: 'news',
    })
    type!: SiteArticleType;

    @ApiProperty({
        description: 'Порядок в перечне.',
        type: Number,
        example: 500,
    })
    sort!: number;

    @ApiProperty({
        description: 'Дополнительные свойства статьи; null — нет.',
        ...SITE_ARTICLE_META_SCHEMA,
    })
    meta!: SiteArticleMeta | null;

    @ApiProperty({
        description: 'Когда опубликована.',
        type: String,
        format: 'date-time',
        example: '2026-11-18T12:00:00.000Z',
        nullable: true,
    })
    publishedAt!: string | null;

    @nullableText('Надзаголовок.', 'Новости')
    eyebrow!: string | null;

    @ApiProperty({
        description: 'Заголовок.',
        type: String,
        example: 'Пульс отдела в отчёте KPI',
    })
    title!: string;

    @nullableText('Подводка.', 'Что нового в отчёте руководителя.')
    description!: string | null;

    @ApiProperty({
        description: 'Обложка; null — нет.',
        type: SiteMediaPublicDto,
        nullable: true,
    })
    cover!: SiteMediaPublicDto | null;

    static from(item: SiteArticlePublicListItem): SiteArticlePublicListItemDto {
        return { ...item, publishedAt: isoOrNull(item.publishedAt) };
    }
}

export class SiteArticlePublicListDto {
    @ApiProperty({
        description: 'Опубликованные статьи раздела по порядку, без текста.',
        type: [SiteArticlePublicListItemDto],
    })
    items!: SiteArticlePublicListItemDto[];
}
