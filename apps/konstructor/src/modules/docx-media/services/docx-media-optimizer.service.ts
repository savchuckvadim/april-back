import { Inject, Injectable, Logger } from '@nestjs/common';
import PizZip from 'pizzip';
import {
    DOCX_MEDIA_CONFIG,
    DocxMediaConfig,
} from '../config/docx-media.config';
import {
    DocxMediaItemReport,
    DocxMediaOptimizationResult,
} from '../types/docx-media.types';
import { DocxImageResizer } from './docx-image-resizer.service';

const MEDIA_PREFIX = 'word/media/';

export type DocxMediaOptimizeOptions = {
    /** Только посчитать выигрыш, файл не собирать. */
    dryRun?: boolean;
};

/**
 * Оптимизация картинок внутри .docx-шаблона.
 *
 * Смысл: вся «красота» Word-шаблона лежит картинками внутри файла, и
 * LibreOffice декодирует их при каждой генерации документа. Шаблоны из Canva
 * обычно содержат страницы целиком в растре с многократным запасом по
 * разрешению — из-за этого конвертация занимает десятки секунд. Пережимаем
 * один раз при загрузке шаблона, а не платим на каждой генерации.
 *
 * Формат картинок не меняется, имена файлов внутри архива тоже — значит
 * ссылки в word/_rels и [Content_Types].xml остаются валидными.
 */
@Injectable()
export class DocxMediaOptimizerService {
    private readonly logger = new Logger(DocxMediaOptimizerService.name);

    constructor(
        @Inject(DOCX_MEDIA_CONFIG) private readonly config: DocxMediaConfig,
        private readonly resizer: DocxImageResizer,
    ) {}

    async optimize(
        docxBuffer: Buffer,
        options: DocxMediaOptimizeOptions = {},
    ): Promise<DocxMediaOptimizationResult> {
        const zip = new PizZip(docxBuffer);
        const items: DocxMediaItemReport[] = [];
        let mediaBeforeBytes = 0;
        let mediaAfterBytes = 0;
        let changed = false;

        for (const name of this.mediaNames(zip)) {
            const source = Buffer.from(zip.files[name].asUint8Array());
            mediaBeforeBytes += source.length;

            const report = await this.processOne(zip, name, source, options);
            mediaAfterBytes += report.afterBytes;
            if (
                report.action === 'resized' ||
                report.action === 'recompressed'
            ) {
                changed = true;
            }
            items.push(report);
        }

        const buffer =
            options.dryRun || !changed
                ? null
                : zip.generate({
                      type: 'nodebuffer',
                      compression: 'DEFLATE',
                  });

        return {
            buffer,
            beforeBytes: docxBuffer.length,
            afterBytes: buffer?.length ?? docxBuffer.length,
            mediaBeforeBytes,
            mediaAfterBytes,
            items,
        };
    }

    private async processOne(
        zip: PizZip,
        name: string,
        source: Buffer,
        options: DocxMediaOptimizeOptions,
    ): Promise<DocxMediaItemReport> {
        const shortName = name.slice(MEDIA_PREFIX.length);
        if (source.length < this.config.minBytesToProcess) {
            return {
                name: shortName,
                action: 'skipped-small',
                beforeBytes: source.length,
                afterBytes: source.length,
            };
        }

        const outcome = await this.resizer.resize(source);
        if (outcome.status === 'unsupported') {
            return {
                name: shortName,
                action: 'skipped-format',
                beforeBytes: source.length,
                afterBytes: source.length,
                note: outcome.note,
            };
        }
        if (outcome.status === 'no-gain') {
            return {
                name: shortName,
                action: 'skipped-no-gain',
                beforeBytes: source.length,
                afterBytes: source.length,
                format: outcome.format,
            };
        }
        if (outcome.status === 'failed') {
            this.logger.warn(`${shortName}: ${outcome.note}`);
            return {
                name: shortName,
                action: 'failed',
                beforeBytes: source.length,
                afterBytes: source.length,
                note: outcome.note,
            };
        }

        if (!options.dryRun) {
            zip.file(name, outcome.buffer);
        }
        return {
            name: shortName,
            action: outcome.resized ? 'resized' : 'recompressed',
            beforeBytes: source.length,
            afterBytes: outcome.buffer.length,
            before: outcome.before,
            after: outcome.after,
            format: outcome.format,
        };
    }

    private mediaNames(zip: PizZip): string[] {
        return Object.entries(zip.files)
            .filter(
                ([name, file]) => name.startsWith(MEDIA_PREFIX) && !file.dir,
            )
            .map(([name]) => name);
    }
}
