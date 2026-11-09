import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { SITE_MEDIA_FILE_NAME_PATTERN } from '../domain/media-file-name';
import {
    SITE_MEDIA_KEY_MAX_LENGTH,
    SITE_MEDIA_KEY_PATTERN,
    SITE_MEDIA_KINDS,
    type SiteMediaItem,
    type SiteMediaKind,
} from '../domain/site-media.types';

/** Имя файла: место (до 64) + «.poster» + отпечаток + расширение — с запасом. */
const FILE_NAME_MAX_LENGTH = 100;

export class SiteMediaSectionParamsDto {
    @ApiProperty({
        description:
            'Раздел сайта, к которому относятся кадры: латиница в нижнем регистре, цифры и дефисы. Продающий раздел /platform — «platform».',
        type: String,
        example: 'platform',
        maxLength: SITE_MEDIA_KEY_MAX_LENGTH,
        pattern: SITE_MEDIA_KEY_PATTERN.source,
    })
    @IsString()
    @MaxLength(SITE_MEDIA_KEY_MAX_LENGTH)
    @Matches(SITE_MEDIA_KEY_PATTERN)
    section!: string;
}

export class SiteMediaSlotParamsDto extends SiteMediaSectionParamsDto {
    @ApiProperty({
        description:
            'Место кадра на страницах раздела — id из реестра кадров сайта (SHOTS.md), например форма отчёта о звонке на странице «Звонки».',
        type: String,
        example: 'calls-form',
        maxLength: SITE_MEDIA_KEY_MAX_LENGTH,
        pattern: SITE_MEDIA_KEY_PATTERN.source,
    })
    @IsString()
    @MaxLength(SITE_MEDIA_KEY_MAX_LENGTH)
    @Matches(SITE_MEDIA_KEY_PATTERN)
    slot!: string;
}

export class SiteMediaFileParamsDto extends SiteMediaSectionParamsDto {
    @ApiProperty({
        description:
            'Имя файла из списка медиа раздела: место кадра, у постера — «.poster», отпечаток содержимого и расширение. Другие имена не отдаются.',
        type: String,
        example: 'calls-form.3f9a1c2b4d5e.webp',
        maxLength: FILE_NAME_MAX_LENGTH,
        pattern: SITE_MEDIA_FILE_NAME_PATTERN.source,
    })
    @IsString()
    @MaxLength(FILE_NAME_MAX_LENGTH)
    @Matches(SITE_MEDIA_FILE_NAME_PATTERN)
    file!: string;
}

/**
 * Что стоит на месте кадра. `updatedAt` в DTO — ISO-строка, поэтому
 * зеркалится всё, кроме него.
 */
export class SiteMediaItemDto implements Omit<SiteMediaItem, 'updatedAt'> {
    @ApiProperty({
        description: 'Место кадра на страницах раздела, куда загружен файл.',
        type: String,
        example: 'calls-form',
    })
    slot!: string;

    @ApiProperty({
        description:
            'Что стоит на месте: картинка или видео. Определяется по содержимому файла, а не по имени.',
        type: String,
        enum: SITE_MEDIA_KINDS,
        example: 'image',
    })
    kind!: SiteMediaKind;

    @ApiProperty({
        description:
            'Имя файла кадра в разделе; сайт показывает его по адресу /media/<раздел>/<файл>. Отпечаток в имени меняется вместе с содержимым, поэтому файл кешируется навсегда.',
        type: String,
        example: 'calls-form.3f9a1c2b4d5e.webp',
    })
    file!: string;

    @ApiProperty({
        description: 'Размер файла кадра в байтах.',
        type: Number,
        example: 245760,
        minimum: 1,
    })
    size!: number;

    @ApiProperty({
        description: 'Когда файл кадра записан на сервер (ISO 8601).',
        type: String,
        format: 'date-time',
        example: '2026-11-09T15:30:00.000Z',
    })
    updatedAt!: string;

    @ApiPropertyOptional({
        description:
            'Имя файла постера — картинки, которую видео показывает до запуска. Бывает только у видео.',
        type: String,
        example: 'hub-overview.poster.9b8a7c6d5e4f.jpg',
    })
    poster?: string;

    static from(item: SiteMediaItem): SiteMediaItemDto {
        return {
            slot: item.slot,
            kind: item.kind,
            file: item.file,
            size: item.size,
            updatedAt: item.updatedAt.toISOString(),
            ...(item.poster ? { poster: item.poster } : {}),
        };
    }
}

export class SiteMediaListDto {
    @ApiProperty({
        description:
            'Что загружено в раздел, по местам кадров в алфавитном порядке. Мест без файла в списке нет.',
        type: [SiteMediaItemDto],
    })
    items!: SiteMediaItemDto[];

    static of(items: readonly SiteMediaItem[]): SiteMediaListDto {
        return { items: items.map(item => SiteMediaItemDto.from(item)) };
    }
}

/**
 * Тело загрузки (multipart/form-data) — только для Swagger. Файлы приходят
 * через multer, и сервис проверяет их по содержимому: формат по первым
 * байтам, размер по виду; class-validator к бинарным частям не применим.
 */
export class SiteMediaUploadDto {
    @ApiPropertyOptional({
        description:
            'Файл кадра: картинка PNG, JPG или WebP до 10 МБ либо видео MP4 (H.264) до 80 МБ. Прежний файл места удаляется после записи нового.',
        type: String,
        format: 'binary',
    })
    file?: Express.Multer.File;

    @ApiPropertyOptional({
        description:
            'Постер к видео — картинка до 10 МБ. Можно прислать без файла кадра: тогда меняется только постер уже загруженного ролика.',
        type: String,
        format: 'binary',
    })
    poster?: Express.Multer.File;
}

export class SiteMediaDeletedDto {
    @ApiProperty({
        description:
            'Файлы места удалены с сервера. Сайт уберёт кадр при ближайшей сверке списка — в течение пары минут.',
        type: Boolean,
        example: true,
    })
    deleted!: boolean;
}
