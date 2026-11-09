import type { SiteMediaKind } from './site-media.types';

/**
 * Форматы, которые сайт показывает везде: картинки PNG/JPG/WebP и ролик
 * MP4. Тип определяется по первым байтам файла, а не по имени и не по
 * заголовку браузера: файл отдаётся с адреса сайта, и HTML под видом
 * картинки не должен туда попасть.
 */
export const SITE_MEDIA_FORMATS = {
    png: { kind: 'image', mime: 'image/png' },
    jpg: { kind: 'image', mime: 'image/jpeg' },
    webp: { kind: 'image', mime: 'image/webp' },
    mp4: { kind: 'video', mime: 'video/mp4' },
} as const satisfies Record<string, { kind: SiteMediaKind; mime: string }>;

export type SiteMediaExtension = keyof typeof SITE_MEDIA_FORMATS;

export const SITE_MEDIA_EXTENSIONS = Object.keys(
    SITE_MEDIA_FORMATS,
) as SiteMediaExtension[];

/** Сколько первых байт нужно, чтобы узнать формат. */
export const MEDIA_SIGNATURE_BYTES = 12;

const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Контейнер ISO-BMFF (`ftyp`) с этими брендами — не ролик для сайта: фото
 * iPhone (HEIC/HEIF), AVIF и QuickTime MOV, который играют не все браузеры.
 */
const NOT_WEB_VIDEO_BRANDS = new Set([
    'heic',
    'heix',
    'hevc',
    'hevx',
    'heim',
    'heis',
    'mif1',
    'msf1',
    'avif',
    'avis',
    'qt  ',
]);

const ascii = (head: Buffer, from: number, to: number): string =>
    head.toString('latin1', from, to);

/** Формат по сигнатуре; null — не картинка и не ролик, которые показывает сайт. */
export function sniffMediaFormat(head: Buffer): SiteMediaExtension | null {
    if (head.length < MEDIA_SIGNATURE_BYTES) return null;
    if (head.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        return 'png';
    }
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') {
        return 'webp';
    }
    if (ascii(head, 4, 8) === 'ftyp') {
        return NOT_WEB_VIDEO_BRANDS.has(ascii(head, 8, 12)) ? null : 'mp4';
    }
    return null;
}
