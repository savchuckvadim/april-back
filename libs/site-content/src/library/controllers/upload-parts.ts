import { SITE_MEDIA_MAX_UPLOAD_BYTES } from '../../media/domain/site-media.types';
import type { SiteMediaLibraryUpload } from '../domain/site-media-library.types';

/** Потолок файла в запросе — самый большой из видов (ролик); точный — в сервисе. */
export const SITE_MEDIA_LIBRARY_MULTER_LIMITS = {
    fileSize: SITE_MEDIA_MAX_UPLOAD_BYTES,
} as const;

/** Части multipart-запроса загрузки медиа (FileFieldsInterceptor). */
export interface SiteMediaLibraryUploadParts {
    file?: Express.Multer.File[];
    poster?: Express.Multer.File[];
    dark?: Express.Multer.File[];
}

export const uploadOf = (
    file: Express.Multer.File | undefined,
): SiteMediaLibraryUpload | undefined =>
    file ? { buffer: file.buffer } : undefined;

export const firstUpload = (
    files: Express.Multer.File[] | undefined,
): SiteMediaLibraryUpload | undefined => uploadOf(files?.[0]);
