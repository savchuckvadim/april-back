import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService } from '@lib/core/storage';
import { PdfMergeService } from '../services/pdf-export/pdf-merge.service';

/**
 * Склейка PDF: страницы идут подряд в порядке списка. Из памяти — для
 * предпросмотра и PDF-КП; по путям — для Word-КП (файл в хранилище и ссылка).
 */
const pdfWithPages = async (widths: number[]): Promise<Buffer> => {
    const document = await PDFDocument.create();
    for (const width of widths) {
        document.addPage([width, 100]);
    }
    return Buffer.from(await document.save());
};

const pageWidths = async (bytes: Uint8Array): Promise<number[]> => {
    const document = await PDFDocument.load(bytes);
    return document.getPages().map(page => Math.round(page.getWidth()));
};

const setup = async (files: Record<string, Buffer> = {}) => {
    const readFile = jest.fn<Promise<Buffer>, [string]>(path =>
        Promise.resolve(files[path]),
    );
    const saveFile = jest.fn<Promise<string>, [Buffer, string, string, string]>(
        (_buffer, fileName) => Promise.resolve(`/abs/${fileName}`),
    );
    const createPublicLink = jest.fn(
        (
            _domain: string,
            _userId: number,
            _app: string,
            _sub: string,
            _year: string,
            fileName: string,
        ) => Promise.resolve(`/api/files/${fileName}`),
    );
    const moduleRef = await Test.createTestingModule({
        providers: [
            PdfMergeService,
            { provide: StorageService, useValue: { readFile, saveFile } },
            { provide: FileLinkService, useValue: { createPublicLink } },
            {
                provide: ConfigService,
                useValue: { get: jest.fn(() => 'https://app.test') },
            },
        ],
    }).compile();
    return {
        service: moduleRef.get(PdfMergeService),
        readFile,
        saveFile,
        createPublicLink,
    };
};

describe('PdfMergeService', () => {
    it('mergeBuffers: страницы всех PDF подряд в порядке списка, без записи на диск', async () => {
        const { service, saveFile, readFile } = await setup();
        const first = await pdfWithPages([200]);
        const second = await pdfWithPages([300, 400]);

        const merged = await service.mergeBuffers([first, second]);

        expect(await pageWidths(merged)).toEqual([200, 300, 400]);
        expect(saveFile).not.toHaveBeenCalled();
        expect(readFile).not.toHaveBeenCalled();
    });

    it('mergeBuffers: порядок списка задаёт порядок страниц', async () => {
        const { service } = await setup();
        const first = await pdfWithPages([200]);
        const second = await pdfWithPages([300]);

        expect(
            await pageWidths(await service.mergeBuffers([second, first])),
        ).toEqual([300, 200]);
    });

    it('mergeBuffers: битый PDF даёт ошибку, неполный файл молча не отдаётся', async () => {
        const { service } = await setup();
        const good = await pdfWithPages([200]);

        await expect(
            service.mergeBuffers([good, Buffer.from('не PDF')]),
        ).rejects.toThrow();
    });

    it('merge: читает файлы по путям, кладёт склейку в konstructor/offer-word и отдаёт ссылку', async () => {
        const files = {
            '/tmp/a.pdf': await pdfWithPages([200]),
            '/tmp/b.pdf': await pdfWithPages([300]),
        };
        const { service, readFile, saveFile, createPublicLink } =
            await setup(files);

        const result = await service.merge({
            pdfAbsolutePaths: ['/tmp/a.pdf', '/tmp/b.pdf'],
            domain: 'test.bitrix24.ru',
            userId: 6,
            year: '2026',
        });

        expect(readFile.mock.calls.map(([path]) => path)).toEqual([
            '/tmp/a.pdf',
            '/tmp/b.pdf',
        ]);
        expect(saveFile).toHaveBeenCalledTimes(1);
        const [buffer, fileName, , subPath] = saveFile.mock.calls[0];
        expect(await pageWidths(buffer)).toEqual([200, 300]);
        expect(subPath).toBe('konstructor/offer-word/2026/test.bitrix24.ru/6');
        expect(createPublicLink).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            6,
            'konstructor',
            'offer-word',
            '2026',
            fileName,
        );
        expect(result).toEqual({
            absolutePath: `/abs/${fileName}`,
            link: `https://app.test/api/files/${fileName}`,
            fileName,
        });
    });
});
