import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { buildMediaFileName, mediaContentHash } from './media-file-name';
import {
    SITE_MEDIA_FORMATS,
    sniffMediaFormat,
    type SiteMediaExtension,
} from './media-format';
import { SITE_MEDIA_MESSAGES } from './site-media.messages';
import {
    SITE_MEDIA_MAX_BYTES,
    type SiteMediaRole,
    type SiteMediaUpload,
} from './site-media.types';

/** Файл, готовый к записи: имя с отпечатком, содержимое, формат. */
export interface PreparedMediaFile {
    name: string;
    content: Buffer;
    extension: SiteMediaExtension;
}

/** Файл места на диске и его роль (кадр или постер). */
export interface SlotMediaFile {
    name: string;
    role: SiteMediaRole;
}

/** Формат по содержимому, потолок по виду, имя с отпечатком. */
export function prepareMediaFile(
    slot: string,
    role: SiteMediaRole,
    upload: SiteMediaUpload,
): PreparedMediaFile {
    const extension = sniffMediaFormat(upload.buffer);
    if (!extension) {
        throw new BadRequestException(
            role === 'poster'
                ? SITE_MEDIA_MESSAGES.posterNotImage
                : SITE_MEDIA_MESSAGES.unsupported,
        );
    }
    const { kind } = SITE_MEDIA_FORMATS[extension];
    if (role === 'poster' && kind !== 'image') {
        throw new BadRequestException(SITE_MEDIA_MESSAGES.posterNotImage);
    }
    if (upload.buffer.length > SITE_MEDIA_MAX_BYTES[kind]) {
        throw new PayloadTooLargeException(
            kind === 'video'
                ? SITE_MEDIA_MESSAGES.videoTooLarge
                : SITE_MEDIA_MESSAGES.imageTooLarge,
        );
    }
    return {
        name: buildMediaFileName(
            slot,
            role,
            mediaContentHash(upload.buffer),
            extension,
        ),
        content: upload.buffer,
        extension,
    };
}

/**
 * Что убрать после записи: прежний кадр, если пришёл новый; прежний
 * постер, если пришёл новый или место стало картинкой (у картинки
 * постера не бывает).
 */
export function outdatedMediaFiles(
    before: readonly SlotMediaFile[],
    main: PreparedMediaFile | undefined,
    poster: PreparedMediaFile | undefined,
): string[] {
    const becameImage =
        main !== undefined &&
        SITE_MEDIA_FORMATS[main.extension].kind === 'image';
    return before
        .filter(file =>
            file.role === 'main'
                ? main !== undefined && file.name !== main.name
                : (poster !== undefined && file.name !== poster.name) ||
                  becameImage,
        )
        .map(file => file.name);
}
