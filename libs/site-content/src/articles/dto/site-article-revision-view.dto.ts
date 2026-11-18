import { ApiProperty } from '@nestjs/swagger';
import {
    SITE_ARTICLE_CONTENT_FORMATS,
    SITE_ARTICLE_REVISION_SOURCES,
    type SiteArticleContentFormat,
    type SiteArticleRevisionSource,
} from '../domain/site-article.const';
import type { SiteArticleBlock } from '../domain/site-article-content.parse';
import type {
    SiteArticleRecord,
    SiteArticleRevisionRecord,
    SiteArticleRevisionSummary,
} from '../domain/site-article.types';
import { SITE_ARTICLE_BLOCKS_SCHEMA } from './site-article-draft.dto';
import { isoOrNull, SiteArticleDto } from './site-article-view.dto';

const nullableText = (description: string, example: string) =>
    ApiProperty({ description, type: String, example, nullable: true });

/** Версия в истории — без текста. */
export class SiteArticleRevisionSummaryDto
    implements Omit<SiteArticleRevisionSummary, 'createdAt'>
{
    @ApiProperty({
        description: 'Id версии.',
        type: String,
        format: 'uuid',
        example: '4a5d8c1e-3f2b-4f6b-9a7c-91e2d3c4b5a6',
    })
    id!: string;

    @ApiProperty({
        description: 'Id статьи.',
        type: String,
        format: 'uuid',
        example: '8c1e3f2b-4a5d-4f6b-9a7c-2d3c4b5a691e',
    })
    articleId!: string;

    @ApiProperty({
        description: 'Номер версии внутри статьи: 1, 2, 3 …',
        type: Number,
        example: 3,
    })
    number!: number;

    @ApiProperty({
        description:
            'Откуда версия: admin — правка, code — из кода сайта, restore — копия прежней версии.',
        type: String,
        enum: SITE_ARTICLE_REVISION_SOURCES,
        example: 'admin',
    })
    source!: SiteArticleRevisionSource;

    @ApiProperty({
        description: 'Формат блоков.',
        type: String,
        enum: SITE_ARTICLE_CONTENT_FORMATS,
        example: 'theory-v1',
    })
    contentFormat!: SiteArticleContentFormat;

    @ApiProperty({
        description: 'Заголовок версии.',
        type: String,
        example: 'Разбор звонка',
    })
    title!: string;

    @nullableText(
        'Отпечаток главы из кода, на которой сделана правка.',
        '9f2c4a1b7e3d5c60',
    )
    baseCodeHash!: string | null;

    @nullableText('Пометка правщика.', 'Обновил главу о прогнозе')
    comment!: string | null;

    @nullableText('Кто сохранил (логин).', 'admin')
    createdBy!: string | null;

    @ApiProperty({
        description: 'Когда сохранена (ISO 8601).',
        type: String,
        format: 'date-time',
        example: '2026-11-18T10:00:00.000Z',
        nullable: true,
    })
    createdAt!: string | null;

    static from(
        summary: SiteArticleRevisionSummary,
    ): SiteArticleRevisionSummaryDto {
        return {
            id: summary.id,
            articleId: summary.articleId,
            number: summary.number,
            source: summary.source,
            contentFormat: summary.contentFormat,
            title: summary.title,
            baseCodeHash: summary.baseCodeHash,
            comment: summary.comment,
            createdBy: summary.createdBy,
            createdAt: isoOrNull(summary.createdAt),
        };
    }
}

/** Версия целиком: текст и блоки. */
export class SiteArticleRevisionDto
    extends SiteArticleRevisionSummaryDto
    implements Omit<SiteArticleRevisionRecord, 'createdAt'>
{
    @nullableText('Надзаголовок.', 'AI для отдела продаж')
    eyebrow!: string | null;

    @nullableText('Подводка под заголовком.', 'Как AI разбирает звонок.')
    description!: string | null;

    @nullableText('Заголовок для поисковиков.', 'Разбор звонков AI — April')
    seoTitle!: string | null;

    @nullableText('Описание для поисковиков.', 'Что AI находит в звонке.')
    seoDescription!: string | null;

    @ApiProperty({
        description: 'Блоки статьи по формату.',
        ...SITE_ARTICLE_BLOCKS_SCHEMA,
    })
    blocks!: SiteArticleBlock[];

    static fromRecord(
        record: SiteArticleRevisionRecord,
    ): SiteArticleRevisionDto {
        return {
            ...SiteArticleRevisionSummaryDto.from(record),
            eyebrow: record.eyebrow,
            description: record.description,
            seoTitle: record.seoTitle,
            seoDescription: record.seoDescription,
            blocks: record.blocks,
        };
    }
}

export class SiteArticleRevisionListDto {
    @ApiProperty({
        description: 'История версий, новые первыми.',
        type: [SiteArticleRevisionSummaryDto],
    })
    items!: SiteArticleRevisionSummaryDto[];
}

/** Итог сохранения черновика или копии: новая версия и статья с новым состоянием. */
export class SiteArticleSavedDto {
    @ApiProperty({
        description: 'Сохранённая версия.',
        type: SiteArticleRevisionDto,
    })
    revision!: SiteArticleRevisionDto;

    @ApiProperty({
        description:
            'Статья после сохранения: номер последней версии — для следующего expectedNumber.',
        type: SiteArticleDto,
    })
    article!: SiteArticleDto;

    static of(
        revision: SiteArticleRevisionRecord,
        article: SiteArticleRecord,
    ): SiteArticleSavedDto {
        return {
            revision: SiteArticleRevisionDto.fromRecord(revision),
            article: SiteArticleDto.from(article),
        };
    }
}

/** Карточка статьи для редактора: статья и последняя версия целиком. */
export class SiteArticleCardDto {
    @ApiProperty({ description: 'Статья.', type: SiteArticleDto })
    article!: SiteArticleDto;

    @ApiProperty({
        description:
            'Последняя версия целиком (черновик или опубликованная); null — текста в базе нет, глава показывается из кода.',
        type: SiteArticleRevisionDto,
        nullable: true,
    })
    latest!: SiteArticleRevisionDto | null;
}
