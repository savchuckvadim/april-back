import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { Metadata, Sharp } from 'sharp';
import {
    DOCX_MEDIA_CONFIG,
    DocxMediaConfig,
} from '../config/docx-media.config';

/** Форматы, которые умеем пережимать без смены формата (значит — без правки zip-ссылок). */
const SUPPORTED_FORMATS = ['jpeg', 'png', 'webp'] as const;
type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

export type ResizeOutcome =
    | {
          status: 'ok';
          buffer: Buffer;
          format: SupportedFormat;
          before: { width: number; height: number };
          after: { width: number; height: number };
          resized: boolean;
      }
    | { status: 'unsupported'; note: string }
    | { status: 'no-gain'; format: SupportedFormat }
    | { status: 'failed'; note: string };

/**
 * Уменьшает одну картинку, СОХРАНЯЯ формат.
 *
 * Формат не меняем сознательно: переименование файла внутри .docx требует
 * правки word/_rels/*.rels и [Content_Types].xml, а любая ошибка там — это
 * битый шаблон у клиента. Ресайз в том же формате безопасен и даёт основную
 * часть выигрыша, потому что LibreOffice тратит время на пиксели.
 */
@Injectable()
export class DocxImageResizer {
    private readonly logger = new Logger(DocxImageResizer.name);

    constructor(
        @Inject(DOCX_MEDIA_CONFIG) private readonly config: DocxMediaConfig,
    ) {}

    async resize(source: Buffer): Promise<ResizeOutcome> {
        let image = sharp(source, { failOn: 'none' });
        let metadata: Metadata;
        try {
            metadata = await image.metadata();
        } catch {
            // sharp не смог даже прочитать файл — это EMF/WMF или другая
            // экзотика. Не ошибка, просто не наш формат.
            return { status: 'unsupported', note: 'формат не читается' };
        }

        const format = metadata.format;
        if (!this.isSupported(format)) {
            // EMF/WMF/SVG и прочая экзотика: sharp их не читает, а
            // конвертация в растр сменила бы формат — не наш случай.
            return {
                status: 'unsupported',
                note: `формат ${format ?? 'неизвестен'}`,
            };
        }
        const { width, height } = metadata;
        if (!width || !height) {
            return { status: 'failed', note: 'не удалось прочитать размеры' };
        }

        const limit = this.config.maxDimensionPx;
        const needsResize = Math.max(width, height) > limit;
        if (needsResize) {
            image = image.resize({
                width: limit,
                height: limit,
                fit: 'inside',
                withoutEnlargement: true,
            });
        }

        try {
            const buffer = await this.encode(image, format).toBuffer();
            // Пережали, а стало не легче — оставляем оригинал. Так бывает на
            // уже оптимизированных картинках.
            if (buffer.length >= source.length) {
                return { status: 'no-gain', format };
            }
            const after = await sharp(buffer).metadata();
            return {
                status: 'ok',
                buffer,
                format,
                before: { width, height },
                after: {
                    width: after.width ?? width,
                    height: after.height ?? height,
                },
                resized: needsResize,
            };
        } catch (error) {
            this.logger.warn(
                `Не удалось пережать картинку: ${(error as Error).message}`,
            );
            return { status: 'failed', note: (error as Error).message };
        }
    }

    private encode(image: Sharp, format: SupportedFormat): Sharp {
        switch (format) {
            case 'jpeg':
                return image.jpeg({
                    quality: this.config.jpegQuality,
                    mozjpeg: true,
                });
            case 'webp':
                return image.webp({ quality: this.config.jpegQuality });
            case 'png':
                // Альфа сохраняется; palette не включаем — на фотографиях
                // (а в шаблонах из Canva это фото на всю страницу) он портит вид.
                return image.png({ compressionLevel: 9, effort: 7 });
        }
    }

    private isSupported(format?: string): format is SupportedFormat {
        return SUPPORTED_FORMATS.includes(format as SupportedFormat);
    }
}
