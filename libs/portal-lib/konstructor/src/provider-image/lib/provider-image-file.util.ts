import sharp from 'sharp';
import { ProviderImageFormat } from '../provider-image.entity';

/** Потолок размера файла: печать, подпись и логотип — небольшие картинки. */
export const PROVIDER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Потолок стороны в пикселях. PNG на 2 МБ может нести десятки миллионов
 * пикселей, а react-pdf разворачивает картинку в память целиком.
 */
export const PROVIDER_IMAGE_MAX_SIDE = 6000;

/** Длина имени файла в `provider_images.original_name`. */
export const PROVIDER_IMAGE_NAME_MAX_LENGTH = 255;

export const PROVIDER_IMAGE_MIME: Readonly<
    Record<ProviderImageFormat, string>
> = {
    png: 'image/png',
    jpg: 'image/jpeg',
};

const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Формат по первым байтам файла. Имя и заголовок браузера в расчёт не идут:
 * картинку отдаёт ручка админки, и под видом картинки не должно лежать ничего
 * другого. null — не PNG и не JPG.
 */
export const sniffProviderImageFormat = (
    head: Buffer,
): ProviderImageFormat | null => {
    if (head.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        return 'png';
    }
    if (
        head.length >= 3 &&
        head[0] === 0xff &&
        head[1] === 0xd8 &&
        head[2] === 0xff
    ) {
        return 'jpg';
    }
    return null;
};

export interface ProviderImageSize {
    width: number;
    height: number;
}

/**
 * Ширина и высота так, как их покажет браузер: с учётом поворота из EXIF.
 * sharp читает только заголовок, пиксели не раскодирует. null — файл не
 * читается как картинка.
 */
export const readProviderImageSize = async (
    buffer: Buffer,
): Promise<ProviderImageSize | null> => {
    try {
        const meta = await sharp(buffer).metadata();
        const width = meta.autoOrient?.width ?? meta.width;
        const height = meta.autoOrient?.height ?? meta.height;
        return width > 0 && height > 0 ? { width, height } : null;
    } catch {
        return null;
    }
};

/** Картинка в простом виде, который react-pdf рисует без сюрпризов. */
export interface NormalizedProviderImage extends ProviderImageSize {
    data: Buffer;
}

/** Качество JPEG при перекодировании: повторное сжатие не должно размывать печать. */
const JPEG_QUALITY = 90;

/**
 * Перекодирование загруженной картинки в простой вид:
 * - PNG: 8 бит на канал, sRGB с альфа-каналом (RGBA), без чересстрочности и
 *   без палитры; 16-битные и серые PNG приводятся к нему же;
 * - JPEG: sRGB (CMYK переводится), обычный (не прогрессивный), цветность 4:4:4.
 *
 * Поворот из EXIF применяется к пикселям (метаданные при записи не
 * сохраняются), поэтому ширина и высота результата — как их покажет браузер.
 * Формат результата тот же, что у загруженного файла. null — файл не
 * перекодируется (повреждён).
 */
export const normalizeProviderImage = async (
    buffer: Buffer,
    format: ProviderImageFormat,
): Promise<NormalizedProviderImage | null> => {
    try {
        const pipeline = sharp(buffer).autoOrient().toColourspace('srgb');
        const { data, info } =
            format === 'png'
                ? await pipeline
                      .ensureAlpha()
                      .png({
                          progressive: false,
                          palette: false,
                          compressionLevel: 9,
                      })
                      .toBuffer({ resolveWithObject: true })
                : await pipeline
                      .jpeg({
                          progressive: false,
                          quality: JPEG_QUALITY,
                          chromaSubsampling: '4:4:4',
                      })
                      .toBuffer({ resolveWithObject: true });
        return { data, width: info.width, height: info.height };
    } catch {
        return null;
    }
};

/**
 * multer отдаёт имя файла в latin1: кириллица приходит кракозябрами. Имя из
 * символов до 0xFF читается как байты utf8; не получилось — остаётся как есть.
 */
const recodeLatin1Name = (name: string): string => {
    if ([...name].some(char => char.charCodeAt(0) > 0xff)) return name;
    const recoded = Buffer.from(name, 'latin1').toString('utf8');
    return recoded.includes('�') ? name : recoded;
};

/**
 * Имя файла для показа в админке: кириллица восстановлена, каталоги из имени
 * убраны, длина обрезана. Пустое имя — null.
 */
export const cleanUploadName = (name: string | undefined): string | null => {
    if (!name) return null;
    const base = recodeLatin1Name(name).split(/[\\/]/).pop()?.trim() ?? '';
    return base ? base.slice(0, PROVIDER_IMAGE_NAME_MAX_LENGTH) : null;
};
