import { ApiProperty } from '@nestjs/swagger';
import {
    SITE_MEDIA_EMBED_PROVIDERS,
    SITE_MEDIA_LIBRARY_KINDS,
    type SiteMediaEmbedProvider,
    type SiteMediaLibraryKind,
} from '../domain/site-media-library.const';
import type {
    SiteMediaListPage,
    SiteMediaUsage,
} from '../domain/site-media-library.types';
import {
    toSiteMediaView,
    type SiteMediaView,
} from '../domain/site-media-library.view';

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

const nullableText = (description: string, example: string) =>
    ApiProperty({ description, type: String, example, nullable: true });

const nullableInt = (description: string, example: number) =>
    ApiProperty({ description, type: Number, example, nullable: true });

/** Медиа в админке. Время — ISO-строки, поэтому зеркалится всё, кроме них. */
export class SiteMediaLibraryItemDto
    implements Omit<SiteMediaView, 'createdAt' | 'updatedAt'>
{
    @ApiProperty({
        description: 'Id медиа (uuid); он же — основа имени файла на диске.',
        type: String,
        format: 'uuid',
        example: '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69',
    })
    id!: string;

    @ApiProperty({
        description:
            'Вид: картинка, ролик MP4 на нашем сервере или только внешнее видео.',
        type: String,
        enum: SITE_MEDIA_LIBRARY_KINDS,
        example: 'image',
    })
    kind!: SiteMediaLibraryKind;

    @nullableText(
        'Служебное название в медиатеке; посетители сайта его не видят.',
        'Пульс отдела — отчёт KPI',
    )
    title!: string | null;

    @nullableText(
        'Подпись под кадром по умолчанию; статья может поставить свою.',
        'Пульс отдела за неделю',
    )
    caption!: string | null;

    @nullableText(
        'Текст вместо картинки для незрячих и поисковиков.',
        'Таблица звонков менеджеров',
    )
    alt!: string | null;

    @nullableText(
        'Имя файла в разделе library хранилища картинок сайта; у внешнего видео — null.',
        '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69.9b8a7c6d5e4f.webp',
    )
    fileName!: string | null;

    @nullableText(
        'Имя файла тёмного варианта картинки; null — одна картинка на обе темы.',
        '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69-dark.0a1b2c3d4e5f.webp',
    )
    darkFileName!: string | null;

    @nullableText(
        'Имя файла постера ролика; null — до запуска браузер покажет первый кадр.',
        '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69.poster.5e4f3a2b1c0d.jpg',
    )
    posterFileName!: string | null;

    @nullableText('Тип файла по содержимому.', 'image/webp')
    mime!: string | null;

    @nullableInt('Размер файла в байтах.', 245760)
    sizeBytes!: number | null;

    @nullableInt(
        'Ширина в точках: у картинки читает сервер, у ролика — админка.',
        1600,
    )
    width!: number | null;

    @nullableInt('Высота в точках.', 900)
    height!: number | null;

    @nullableInt('Длительность ролика в секундах.', 95)
    durationSec!: number | null;

    @ApiProperty({
        description:
            'Поставщик внешнего видео; null — внешней ссылки нет. Адрес плеера сайт собирает сам по поставщику и id ролика.',
        type: String,
        enum: SITE_MEDIA_EMBED_PROVIDERS,
        example: 'youtube',
        nullable: true,
    })
    embedProvider!: SiteMediaEmbedProvider | null;

    @nullableText(
        'Исходная ссылка на внешнее видео, как её вставили в админке.',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
    embedUrl!: string | null;

    @nullableText('Id ролика у поставщика.', 'dQw4w9WgXcQ')
    embedId!: string | null;

    @nullableText('Логин администратора, загрузившего медиа.', 'admin')
    uploadedBy!: string | null;

    @ApiProperty({
        description: 'Когда медиа загружено (ISO 8601).',
        type: String,
        format: 'date-time',
        example: '2026-11-18T10:00:00.000Z',
        nullable: true,
    })
    createdAt!: string | null;

    @ApiProperty({
        description: 'Когда медиа меняли последний раз (ISO 8601).',
        type: String,
        format: 'date-time',
        example: '2026-11-18T10:05:00.000Z',
        nullable: true,
    })
    updatedAt!: string | null;

    @ApiProperty({
        description:
            'В скольких местах статей стоит медиа. 0 — не используется, его можно удалить.',
        type: Number,
        example: 2,
        minimum: 0,
    })
    usageCount!: number;

    @nullableText(
        'Адрес файла на сайте: /media/library/<файл>. Админка показывает его с адреса сайта.',
        '/media/library/3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69.9b8a7c6d5e4f.webp',
    )
    url!: string | null;

    @nullableText(
        'Адрес тёмного варианта картинки на сайте.',
        '/media/library/3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69-dark.0a1b2c3d4e5f.webp',
    )
    darkUrl!: string | null;

    @nullableText(
        'Адрес постера ролика на сайте.',
        '/media/library/3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69.poster.5e4f3a2b1c0d.jpg',
    )
    posterUrl!: string | null;

    static from(view: SiteMediaView): SiteMediaLibraryItemDto {
        return {
            ...view,
            createdAt: iso(view.createdAt),
            updatedAt: iso(view.updatedAt),
        };
    }
}

export class SiteMediaLibraryListDto {
    @ApiProperty({
        description: 'Медиа страницы, свежие первыми.',
        type: [SiteMediaLibraryItemDto],
    })
    items!: SiteMediaLibraryItemDto[];

    @ApiProperty({
        description: 'Сколько медиа подходит под фильтр всего.',
        type: Number,
        example: 128,
    })
    total!: number;

    @ApiProperty({
        description: 'Номер страницы с 1.',
        type: Number,
        example: 1,
    })
    page!: number;

    @ApiProperty({
        description: 'Сколько медиа на странице.',
        type: Number,
        example: 50,
    })
    pageSize!: number;

    static of(page: SiteMediaListPage): SiteMediaLibraryListDto {
        return {
            ...page,
            items: page.items.map(item =>
                SiteMediaLibraryItemDto.from(toSiteMediaView(item)),
            ),
        };
    }
}

export class SiteMediaUsageDto implements SiteMediaUsage {
    @ApiProperty({
        description: 'Id статьи, где стоит медиа.',
        type: String,
        format: 'uuid',
        example: '8c1e3f2b-4a5d-4f6b-9a7c-2d3c4b5a691e',
    })
    articleId!: string;

    @ApiProperty({
        description: 'Раздел сайта статьи.',
        type: String,
        example: 'ai',
    })
    section!: string;

    @ApiProperty({
        description: 'Адрес статьи внутри раздела.',
        type: String,
        example: 'theory/call-analysis',
    })
    slug!: string;

    @nullableText(
        'Заголовок опубликованной версии, иначе последней; null — текста статьи в базе нет (глава из кода).',
        'Разбор звонка',
    )
    title!: string | null;

    @ApiProperty({
        description:
            'Роль медиа в статье: обложка, место в тексте или галерея.',
        type: String,
        example: 'inline',
    })
    role!: string;

    @nullableText(
        'Место в тексте (id блока-скрина); у обложки — cover, у галереи — null.',
        'scr-kpi-pulse',
    )
    slot!: string | null;
}

export class SiteMediaUsageListDto {
    @ApiProperty({
        description: 'Где стоит медиа: статьи и места в них.',
        type: [SiteMediaUsageDto],
    })
    items!: SiteMediaUsageDto[];
}

export class SiteMediaLibraryDeletedDto {
    @ApiProperty({
        description:
            'Строка и файлы медиа удалены. Удаляется только медиа, которое не стоит ни в одной статье.',
        type: Boolean,
        example: true,
    })
    deleted!: boolean;
}
