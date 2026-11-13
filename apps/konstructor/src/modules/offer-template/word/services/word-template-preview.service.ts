import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
    Injectable,
    Logger,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { StorageService, StorageType } from '@lib/core/storage';
import { getErrorString } from '@lib/shared';
import { createOfferRenderDataFixture } from '@app/konstructor/offer-word/lib/sample-offer-render-data';
import { LibreOfficeService } from '@app/konstructor/modules/libre-office/libre-office.service';
import { WordTemplateService } from './word-template.service';

/** Где лежат превью: сгенерированные (PDF первой страницы) и загруженные вручную. */
const PREVIEW_SUB_PATH = 'konstructor/templates/offer/previews';

/**
 * Версия образца данных: поменяли образец — старые превью перестают
 * совпадать по ключу и собираются заново.
 */
const SAMPLE_VERSION = 'garant-office-1';

/** Образец КП для превью: «Гарант-Офис», вымышленный клиент. */
const PREVIEW_SAMPLE = createOfferRenderDataFixture({
    GeneralProductName: 'Гарант-Офис',
    GeneralProductByContractName:
        'Услуги по информационному обслуживанию Гарант-Офис',
});

/** Типы картинок, которые можно загрузить своим превью. */
export const MANUAL_PREVIEW_TYPES: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
};

export type WordTemplatePreview = { content: Buffer; contentType: string };

/**
 * Превью Word-шаблона КП для магазина шаблонов.
 *
 * Своё изображение (загружено вручную) важнее сгенерированного. Иначе —
 * PDF первой страницы, собранный по шаблону на образце «Гарант-Офис»:
 * кэш по содержимому файла шаблона, поэтому замена файла сама даёт новое
 * превью, а повторные просмотры не гоняют LibreOffice.
 */
@Injectable()
export class WordTemplatePreviewService {
    private readonly logger = new Logger(WordTemplatePreviewService.name);
    /** Одновременные запросы одного превью собирают его один раз. */
    private readonly inFlight = new Map<string, Promise<Buffer>>();

    constructor(
        private readonly storage: StorageService,
        private readonly wordTemplateService: WordTemplateService,
        private readonly libreOffice: LibreOfficeService,
    ) {}

    async getPreview(id: bigint): Promise<WordTemplatePreview> {
        const manual = await this.findManual(id);
        if (manual) return manual;

        const template = await this.wordTemplateService.findById(id);
        if (!(await this.storage.fileExists(template.file_path))) {
            throw new NotFoundException(`Файл шаблона #${id} не найден`);
        }
        const source = await this.storage.readFile(template.file_path);
        const key = createHash('sha1')
            .update(SAMPLE_VERSION)
            .update(source)
            .digest('hex')
            .slice(0, 16);
        const cached = this.cachePath(id, key);
        if (await this.storage.fileExists(cached)) {
            return {
                content: await this.storage.readFile(cached),
                contentType: 'application/pdf',
            };
        }

        const flightKey = `${id}-${key}`;
        let job = this.inFlight.get(flightKey);
        if (!job) {
            job = this.build(id, key, source).finally(() =>
                this.inFlight.delete(flightKey),
            );
            this.inFlight.set(flightKey, job);
        }
        return { content: await job, contentType: 'application/pdf' };
    }

    /** Своё изображение превью (для общедоступных шаблонов). */
    async saveManual(id: bigint, file: Express.Multer.File): Promise<void> {
        const ext = MANUAL_PREVIEW_TYPES[file.mimetype];
        if (!ext) {
            throw new UnprocessableEntityException(
                'Превью — картинка PNG, JPEG или WebP',
            );
        }
        await this.wordTemplateService.findById(id);
        await this.removeManual(id);
        await this.storage.saveFile(
            file.buffer,
            `${id}-manual.${ext}`,
            StorageType.APP,
            PREVIEW_SUB_PATH,
        );
    }

    /** Убрать своё изображение — вернётся сгенерированное превью. */
    async removeManual(id: bigint): Promise<void> {
        for (const ext of Object.values(MANUAL_PREVIEW_TYPES)) {
            const path = this.manualPath(id, ext);
            if (await this.storage.fileExists(path))
                await this.storage.deleteFile(path);
        }
    }

    private async findManual(id: bigint): Promise<WordTemplatePreview | null> {
        for (const [contentType, ext] of Object.entries(MANUAL_PREVIEW_TYPES)) {
            const path = this.manualPath(id, ext);
            if (await this.storage.fileExists(path)) {
                return {
                    content: await this.storage.readFile(path),
                    contentType,
                };
            }
        }
        return null;
    }

    private async build(
        id: bigint,
        key: string,
        source: Buffer,
    ): Promise<Buffer> {
        const workDir = this.storage.getFilePath(
            StorageType.APP,
            `${PREVIEW_SUB_PATH}/tmp`,
            `${id}-${key}`,
        );
        await fs.mkdir(workDir, { recursive: true });
        try {
            const docxPath = join(workDir, 'preview.docx');
            await fs.writeFile(docxPath, this.renderSample(id, source));
            const pdfPath = await this.libreOffice.convertToPdf(
                docxPath,
                workDir,
            );
            const firstPage = await this.firstPage(await fs.readFile(pdfPath));
            await this.storage.saveFile(
                firstPage,
                `${id}-${key}.pdf`,
                StorageType.APP,
                PREVIEW_SUB_PATH,
            );
            this.logger.log(`Превью шаблона #${id} собрано`);
            return firstPage;
        } finally {
            await fs.rm(workDir, { recursive: true, force: true });
        }
    }

    /** Шаблон на образце данных; незаполненное — пустым, а не «undefined». */
    private renderSample(id: bigint, source: Buffer): Buffer {
        try {
            const doc = new Docxtemplater(new PizZip(source), {
                paragraphLoop: true,
                linebreaks: true,
                nullGetter: () => '',
            });
            doc.render(PREVIEW_SAMPLE);
            return doc
                .getZip()
                .generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        } catch (error) {
            throw new UnprocessableEntityException(
                `Шаблон #${id} не собирается: ${getErrorString(error)}`,
            );
        }
    }

    private async firstPage(pdf: Buffer): Promise<Buffer> {
        const source = await PDFDocument.load(pdf);
        const target = await PDFDocument.create();
        const [page] = await target.copyPages(source, [0]);
        target.addPage(page);
        return Buffer.from(await target.save());
    }

    private cachePath(id: bigint, key: string): string {
        return this.storage.getFilePath(
            StorageType.APP,
            PREVIEW_SUB_PATH,
            `${id}-${key}.pdf`,
        );
    }

    private manualPath(id: bigint, ext: string): string {
        return this.storage.getFilePath(
            StorageType.APP,
            PREVIEW_SUB_PATH,
            `${id}-manual.${ext}`,
        );
    }
}
