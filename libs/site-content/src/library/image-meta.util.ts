import sharp from 'sharp';

export interface ImageSize {
    width: number;
    height: number;
}

/**
 * Ширина и высота картинки так, как её покажет браузер: с учётом поворота
 * из EXIF (фото с телефона). sharp читает только заголовок, пиксели не
 * раскодирует. null — файл не читается как картинка.
 */
export async function readImageSize(buffer: Buffer): Promise<ImageSize | null> {
    try {
        const meta = await sharp(buffer).metadata();
        const width = meta.autoOrient?.width ?? meta.width;
        const height = meta.autoOrient?.height ?? meta.height;
        return width > 0 && height > 0 ? { width, height } : null;
    } catch {
        return null;
    }
}
