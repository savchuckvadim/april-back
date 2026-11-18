import { ApiProperty } from '@nestjs/swagger';
import {
    SITE_ARTICLE_SECTIONS,
    SITE_ARTICLE_STATUSES,
    SITE_ARTICLE_TYPES,
    type SiteArticleSection,
    type SiteArticleStatus,
    type SiteArticleType,
} from '../domain/site-article.const';
import type { SiteArticleMeta } from '../domain/site-article-props';
import type {
    SiteArticleRecord,
    SiteArticleState,
} from '../domain/site-article.types';
import { SITE_ARTICLE_META_SCHEMA } from './site-article.dto';

export const isoOrNull = (date: Date | null): string | null =>
    date?.toISOString() ?? null;

const nullableText = (description: string, example: string) =>
    ApiProperty({ description, type: String, example, nullable: true });

const dateTime = (description: string, example: string) =>
    ApiProperty({
        description,
        type: String,
        format: 'date-time',
        example,
        nullable: true,
    });

export class SiteArticleStateDto implements SiteArticleState {
    @ApiProperty({
        description:
            'Номер последней версии; 0 — версий в базе нет (глава показывается из кода).',
        type: Number,
        example: 3,
    })
    latestNumber!: number;

    @ApiProperty({
        description: 'Номер опубликованной версии; null — не публиковалась.',
        type: Number,
        example: 2,
        nullable: true,
    })
    publishedNumber!: number | null;

    @ApiProperty({
        description: 'Есть черновик: последняя версия новее опубликованной.',
        type: Boolean,
        example: true,
    })
    hasDraft!: boolean;
}

/** Статья в админке. Время — ISO-строки. */
export class SiteArticleDto
    implements
        Omit<SiteArticleRecord, 'publishedAt' | 'createdAt' | 'updatedAt'>
{
    @ApiProperty({
        description: 'Id статьи.',
        type: String,
        format: 'uuid',
        example: '8c1e3f2b-4a5d-4f6b-9a7c-2d3c4b5a691e',
    })
    id!: string;

    @ApiProperty({
        description: 'Раздел сайта.',
        type: String,
        enum: SITE_ARTICLE_SECTIONS,
        example: 'ai',
    })
    section!: SiteArticleSection;

    @ApiProperty({
        description: 'Тип: глава из кода, статья, инструкция, новость, кейс.',
        type: String,
        enum: SITE_ARTICLE_TYPES,
        example: 'chapter',
    })
    type!: SiteArticleType;

    @ApiProperty({
        description: 'Адрес внутри раздела; обзорная глава — index.',
        type: String,
        example: 'theory/call-analysis',
    })
    slug!: string;

    @ApiProperty({
        description:
            'Статус: draft — ни разу не публиковалась, published — на сайте, unpublished — снята, archived — в архиве.',
        type: String,
        enum: SITE_ARTICLE_STATUSES,
        example: 'published',
    })
    status!: SiteArticleStatus;

    @ApiProperty({
        description: 'Порядок в перечне раздела.',
        type: Number,
        example: 500,
    })
    sort!: number;

    @ApiProperty({
        description:
            'Дополнительные свойства статьи (метки и т. п.); null — нет.',
        ...SITE_ARTICLE_META_SCHEMA,
    })
    meta!: SiteArticleMeta | null;

    @ApiProperty({
        description: 'Опубликованная версия; null — ни разу не публиковалась.',
        type: String,
        format: 'uuid',
        example: '4a5d8c1e-3f2b-4f6b-9a7c-91e2d3c4b5a6',
        nullable: true,
    })
    publishedRevisionId!: string | null;

    @dateTime(
        'Когда опубликована действующая версия.',
        '2026-11-18T12:00:00.000Z',
    )
    publishedAt!: string | null;

    @nullableText('Кто опубликовал (логин).', 'admin')
    publishedBy!: string | null;

    @nullableText('Кто создал (логин).', 'admin')
    createdBy!: string | null;

    @nullableText('Кто менял последним (логин).', 'admin')
    updatedBy!: string | null;

    @dateTime('Когда создана.', '2026-11-18T10:00:00.000Z')
    createdAt!: string | null;

    @dateTime('Когда менялась последний раз.', '2026-11-18T11:00:00.000Z')
    updatedAt!: string | null;

    @ApiProperty({
        description: 'Версии: последняя, опубликованная, есть ли черновик.',
        type: SiteArticleStateDto,
    })
    state!: SiteArticleStateDto;

    @nullableText(
        'Заголовок последней версии; null — текста в базе нет (глава показывается из кода).',
        'Разбор звонка',
    )
    title!: string | null;

    static from(record: SiteArticleRecord): SiteArticleDto {
        return {
            ...record,
            publishedAt: isoOrNull(record.publishedAt),
            createdAt: isoOrNull(record.createdAt),
            updatedAt: isoOrNull(record.updatedAt),
        };
    }
}

export class SiteArticleListDto {
    @ApiProperty({
        description: 'Статьи по разделу и порядку.',
        type: [SiteArticleDto],
    })
    items!: SiteArticleDto[];
}

export class SiteArticleEnsureResultDto {
    @ApiProperty({
        description: 'Строка главы — новая или уже существовавшая.',
        type: SiteArticleDto,
    })
    article!: SiteArticleDto;

    @ApiProperty({
        description: 'true — строка заведена этим вызовом.',
        type: Boolean,
        example: true,
    })
    created!: boolean;
}

export class SiteArticleDeletedDto {
    @ApiProperty({
        description:
            'Статья удалена навсегда вместе с версиями и привязками медиа.',
        type: Boolean,
        example: true,
    })
    deleted!: boolean;
}
