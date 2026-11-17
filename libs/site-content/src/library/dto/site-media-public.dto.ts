import { ApiProperty } from '@nestjs/swagger';
import {
    SITE_MEDIA_EMBED_PROVIDERS,
    SITE_MEDIA_LIBRARY_KINDS,
    type SiteMediaEmbedProvider,
    type SiteMediaLibraryKind,
} from '../domain/site-media-library.const';
import type { SiteMediaEmbedRef } from '../domain/site-media-library.types';
import type { SiteMediaPublicView } from '../domain/site-media-library.view';

const nullable = (
    description: string,
    type: StringConstructor | NumberConstructor,
    example: string | number,
) => ApiProperty({ description, type, example, nullable: true });

export class SiteMediaEmbedRefDto implements SiteMediaEmbedRef {
    @ApiProperty({
        description:
            'Поставщик внешнего видео. Сайт встраивает плеер только из этого белого списка.',
        type: String,
        enum: SITE_MEDIA_EMBED_PROVIDERS,
        example: 'youtube',
    })
    provider!: SiteMediaEmbedProvider;

    @ApiProperty({
        description:
            'Id ролика у поставщика: YouTube — 11 знаков, Rutube — 32 шестнадцатеричных, VK — «владелец_ролик».',
        type: String,
        example: 'dQw4w9WgXcQ',
    })
    id!: string;
}

/**
 * Медиа статьи для сайта: только то, что нужно для отрисовки. Адреса — на
 * сайте (/media/library/<файл>), сайт проксирует их с бота.
 */
export class SiteMediaPublicDto implements SiteMediaPublicView {
    @ApiProperty({
        description: 'Id медиа.',
        type: String,
        format: 'uuid',
        example: '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69',
    })
    id!: string;

    @ApiProperty({
        description:
            'Вид: картинка, ролик на нашем сервере (у него может быть и запасное внешнее видео) или только внешнее видео.',
        type: String,
        enum: SITE_MEDIA_LIBRARY_KINDS,
        example: 'image',
    })
    kind!: SiteMediaLibraryKind;

    @nullable(
        'Подпись: своя у этой статьи, иначе подпись медиа по умолчанию.',
        String,
        'Пульс отдела за неделю',
    )
    caption!: string | null;

    @nullable(
        'Текст вместо картинки (alt).',
        String,
        'Таблица звонков менеджеров',
    )
    alt!: string | null;

    @nullable(
        'Адрес файла на сайте; у внешнего видео — null.',
        String,
        '/media/library/3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69.9b8a7c6d5e4f.webp',
    )
    url!: string | null;

    @nullable(
        'Адрес картинки для тёмной темы; null — одна картинка на обе темы.',
        String,
        '/media/library/3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69-dark.0a1b2c3d4e5f.webp',
    )
    darkUrl!: string | null;

    @nullable(
        'Адрес постера ролика.',
        String,
        '/media/library/3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69.poster.5e4f3a2b1c0d.jpg',
    )
    posterUrl!: string | null;

    @nullable('Тип файла.', String, 'image/webp')
    mime!: string | null;

    @nullable('Ширина в точках — для резерва места до загрузки.', Number, 1600)
    width!: number | null;

    @nullable('Высота в точках.', Number, 900)
    height!: number | null;

    @nullable('Длительность ролика в секундах.', Number, 95)
    durationSec!: number | null;

    @ApiProperty({
        description:
            'Внешнее видео: поставщик и id ролика; null — внешней ссылки нет. У ролика с файлом — запасной вариант.',
        type: SiteMediaEmbedRefDto,
        nullable: true,
    })
    embed!: SiteMediaEmbedRefDto | null;
}
