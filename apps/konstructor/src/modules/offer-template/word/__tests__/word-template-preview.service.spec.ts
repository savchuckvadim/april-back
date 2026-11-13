import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { StorageService } from '@lib/core/storage';
import { WordTemplatePreviewService } from '../services/word-template-preview.service';

/** Минимальный DOCX: docxtemplater находит основной документ по [Content_Types].xml. */
const docx = (body: string): Buffer => {
    const zip = new PizZip();
    zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
        'word/document.xml',
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            `<w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:body></w:document>`,
    );
    return zip.generate({ type: 'nodebuffer' });
};

const twoPagePdf = async (): Promise<Buffer> => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    return Buffer.from(await pdf.save());
};

describe('WordTemplatePreviewService', () => {
    let root: string;
    let storage: StorageService;
    let templatePath: string;
    let convertToPdf: jest.Mock;
    let service: WordTemplatePreviewService;

    beforeEach(async () => {
        root = mkdtempSync(join(tmpdir(), 'preview-'));
        storage = new StorageService({
            get: () => root,
        } as unknown as ConfigService);
        templatePath = join(root, 'template.docx');
        writeFileSync(templatePath, docx('{GeneralProductName}'));
        const pdf = await twoPagePdf();
        convertToPdf = jest.fn((docxPath: string, outDir: string) => {
            const out = join(outDir, 'preview.pdf');
            writeFileSync(out, pdf);
            return Promise.resolve(out);
        });
        service = new WordTemplatePreviewService(
            storage,
            {
                findById: jest
                    .fn()
                    .mockResolvedValue({ file_path: templatePath }),
            } as never,
            { convertToPdf } as never,
        );
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('собирает PDF первой страницы, повторный запрос — из кэша без LibreOffice', async () => {
        const first = await service.getPreview(BigInt(7));
        expect(first.contentType).toBe('application/pdf');
        expect((await PDFDocument.load(first.content)).getPageCount()).toBe(1);

        await service.getPreview(BigInt(7));
        expect(convertToPdf).toHaveBeenCalledTimes(1);
    });

    it('замена файла шаблона — новое превью', async () => {
        await service.getPreview(BigInt(7));
        writeFileSync(templatePath, docx('Другой текст {GeneralProductName}'));
        await service.getPreview(BigInt(7));
        expect(convertToPdf).toHaveBeenCalledTimes(2);
    });

    it('своя картинка важнее сгенерированного превью', async () => {
        await service.saveManual(BigInt(7), {
            mimetype: 'image/png',
            buffer: Buffer.from('png'),
        } as Express.Multer.File);

        const preview = await service.getPreview(BigInt(7));
        expect(preview.contentType).toBe('image/png');
        expect(convertToPdf).not.toHaveBeenCalled();

        await service.removeManual(BigInt(7));
        expect((await service.getPreview(BigInt(7))).contentType).toBe(
            'application/pdf',
        );
    });

    it('не картинка — 422', async () => {
        await expect(
            service.saveManual(BigInt(7), {
                mimetype: 'application/pdf',
                buffer: Buffer.from('pdf'),
            } as Express.Multer.File),
        ).rejects.toThrow(UnprocessableEntityException);
    });

    it('шаблон с ошибкой в тегах — 422 с причиной', async () => {
        writeFileSync(templatePath, docx('{#ProductRows} без закрытия'));
        await expect(service.getPreview(BigInt(7))).rejects.toThrow(
            'не собирается',
        );
    });
});
