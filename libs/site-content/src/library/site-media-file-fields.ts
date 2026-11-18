import { BadRequestException } from '@nestjs/common';
import { SITE_MEDIA_MESSAGES } from '../media/site-media.service';
import { SITE_MEDIA_LIBRARY_LIMITS } from './domain/site-media-library.const';
import { SITE_MEDIA_LIBRARY_MESSAGES } from './domain/site-media-library.messages';
import type {
    SiteMediaCreateInput,
    SiteMediaLibraryUpload,
    SiteMediaVideoMeta,
} from './domain/site-media-library.types';
import {
    inspectUpload,
    type SiteMediaUploadInfo,
} from './domain/site-media-upload.inspect';
import { readImageSize, type ImageSize } from './image-meta.util';

/** Поля строки, которые описывают файл. */
export type SiteMediaFileFields = Pick<
    SiteMediaCreateInput,
    'mime' | 'sizeBytes' | 'width' | 'height' | 'durationSec'
>;

/** Вид и тип файла; не картинка и не ролик сайта — 400 тем же текстом, что у кадров /platform. */
export function requireUploadInfo(
    upload: SiteMediaLibraryUpload,
): SiteMediaUploadInfo {
    const info = inspectUpload(upload);
    if (!info) throw new BadRequestException(SITE_MEDIA_MESSAGES.unsupported);
    return info;
}

/** Размеры картинки; битый файл или сторона больше колонки — 400. */
export async function requireImageSize(buffer: Buffer): Promise<ImageSize> {
    const size = await readImageSize(buffer);
    if (!size) {
        throw new BadRequestException(
            SITE_MEDIA_LIBRARY_MESSAGES.imageUnreadable,
        );
    }
    const limit = SITE_MEDIA_LIBRARY_LIMITS.side;
    if (size.width > limit || size.height > limit) {
        throw new BadRequestException(SITE_MEDIA_LIBRARY_MESSAGES.imageTooWide);
    }
    return size;
}

/** Тёмный вариант — только картинка, и она должна читаться. */
export async function requireDarkImage(
    upload: SiteMediaLibraryUpload,
): Promise<void> {
    if (inspectUpload(upload)?.kind !== 'image') {
        throw new BadRequestException(SITE_MEDIA_LIBRARY_MESSAGES.darkNotImage);
    }
    await requireImageSize(upload.buffer);
}

/**
 * Описание файла для строки: у картинки размеры читает сервер, у ролика их
 * присылает админка (браузер читает из <video>); не прислала — пусто, а не
 * размеры прежнего файла.
 */
export async function fileFieldsOf(
    upload: SiteMediaLibraryUpload,
    info: SiteMediaUploadInfo,
    video: SiteMediaVideoMeta,
): Promise<SiteMediaFileFields> {
    if (info.kind === 'image') {
        const size = await requireImageSize(upload.buffer);
        return {
            mime: info.mime,
            sizeBytes: info.sizeBytes,
            width: size.width,
            height: size.height,
            durationSec: null,
        };
    }
    return {
        mime: info.mime,
        sizeBytes: info.sizeBytes,
        width: video.width ?? null,
        height: video.height ?? null,
        durationSec: video.durationSec ?? null,
    };
}
