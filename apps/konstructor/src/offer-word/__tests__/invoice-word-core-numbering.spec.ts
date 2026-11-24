import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import PizZip from 'pizzip';
import type { InvoiceTemplate } from 'generated/prisma';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService } from '@lib/core/storage';
import { InvoiceTemplateService } from '@app/konstructor/modules/invoice-template';
import { InvoiceBuildRequest } from '../types/invoice-build-request.type';
import { InvoiceTemplateSourceService } from '../services/invoice-word-core/invoice-template-source.service';
import { InvoiceWordCoreGenerateService } from '../services/invoice-word-core/invoice-word-core-generate.service';
import {
    IInvoiceRenderData,
    InvoiceRenderDataService,
} from '../services/render-data-services/invoice-render-data.service';

/**
 * Настоящий рендер DOCX из маленького шаблона: видно, какой номер счёта
 * доходит до файла и в какую папку по году он ложится.
 */
const DOCUMENT_XML = (body: string): string =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:body></w:document>`;

const templateDocx = (): Buffer => {
    const zip = new PizZip();
    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
            `<Default Extension="xml" ContentType="application/xml"/>` +
            `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
            `</Types>`,
    );
    zip.file('word/document.xml', DOCUMENT_XML('Счёт N [{InvoiceNumber}]'));
    return zip.generate({ type: 'nodebuffer' });
};

/** Текст абзаца отрендеренного DOCX. */
const textOf = (docx: Buffer): string => {
    const xml = new PizZip(docx).file('word/document.xml')?.asText() ?? '';
    return /<w:t[^>]*>([^<]*)<\/w:t>/.exec(xml)?.[1] ?? '';
};

const templateRow: InvoiceTemplate = {
    id: 'tpl-1',
    created_at: null,
    updated_at: null,
    visibility: 'portal',
    file_path: 'konstructor/invoice-templates/tpl-1.docx',
    demo_path: null,
    type: 'word',
    name: 'Счёт',
    code: 'invoice-tpl-1',
    counter: 0,
    description: null,
    is_default: true,
    is_active: true,
    is_archived: false,
    archived_at: null,
    portal_id: null,
    agent_id: null,
    creator_bitrix_user_id: null,
    client_types: null,
    supply_types: null,
};

const request = (): InvoiceBuildRequest =>
    ({
        domain: 'gsr.bitrix24.ru',
        userId: 6,
        providerId: 12,
        invoiceTemplateId: '',
    }) as unknown as InvoiceBuildRequest;

const price = (setKind: 'general' | 'alternative', setIndex: number) => ({
    rows: {},
    total: {},
    setKind,
    setIndex,
});

const renderDataOf = (
    invoiceNumber: string,
    count: number,
): IInvoiceRenderData =>
    ({
        InvoiceNumber: invoiceNumber,
        prices: Array.from({ length: count }, (_, index) =>
            price(index === 0 ? 'general' : 'alternative', index),
        ),
    }) as unknown as IInvoiceRenderData;

const setup = async () => {
    const saved: Array<{ buffer: Buffer; subPath: string }> = [];
    const saveFile = jest.fn<Promise<string>, [Buffer, string, string, string]>(
        (buffer, fileName, _type, subPath) => {
            saved.push({ buffer, subPath });
            return Promise.resolve(`/abs/${fileName}`);
        },
    );
    const createPublicLink = jest.fn(
        (
            _domain: string,
            _userId: number,
            _app: string,
            _sub: string,
            year: string,
            fileName: string,
        ) => Promise.resolve(`/api/files/${year}/${fileName}`),
    );
    const getInvoiceRenderData = jest.fn<
        Promise<IInvoiceRenderData>,
        [InvoiceBuildRequest]
    >();

    const moduleRef = await Test.createTestingModule({
        providers: [
            InvoiceWordCoreGenerateService,
            {
                provide: InvoiceTemplateService,
                useValue: { toDto: jest.fn().mockReturnValue({}) },
            },
            {
                provide: InvoiceTemplateSourceService,
                useValue: { resolve: jest.fn().mockResolvedValue(templateRow) },
            },
            {
                provide: StorageService,
                useValue: {
                    saveFile,
                    fileExists: jest.fn().mockResolvedValue(true),
                    readFile: jest.fn(() => Promise.resolve(templateDocx())),
                },
            },
            { provide: FileLinkService, useValue: { createPublicLink } },
            {
                provide: ConfigService,
                useValue: { get: jest.fn(() => 'https://app.test') },
            },
            {
                provide: InvoiceRenderDataService,
                useValue: { getInvoiceRenderData },
            },
        ],
    }).compile();

    return {
        service: moduleRef.get(InvoiceWordCoreGenerateService),
        saved,
        createPublicLink,
        getInvoiceRenderData,
    };
};

describe('InvoiceWordCoreGenerateService: номера нескольких счетов', () => {
    it('первый счёт — номер N, следующие — N-1, N-2', async () => {
        const ctx = await setup();
        ctx.getInvoiceRenderData.mockResolvedValue(renderDataOf('15', 3));

        const result = await ctx.service.execute(request());

        expect(result.savedResults).toHaveLength(3);
        expect(ctx.saved.map(file => textOf(file.buffer))).toEqual([
            'Счёт N [15]',
            'Счёт N [15-1]',
            'Счёт N [15-2]',
        ]);
        // общие данные счёта в ответе остаются с номером N
        expect(result.renderData?.InvoiceNumber).toBe('15');
    });

    it('сквозной сдвиг: счета следующего договора продолжают нумерацию', async () => {
        const ctx = await setup();
        ctx.getInvoiceRenderData.mockResolvedValue(renderDataOf('15', 2));

        await ctx.service.execute(request(), { numberOffset: 2 });

        expect(ctx.saved.map(file => textOf(file.buffer))).toEqual([
            'Счёт N [15-2]',
            'Счёт N [15-3]',
        ]);
    });

    it('один счёт без сдвига — номер без суффикса', async () => {
        const ctx = await setup();
        ctx.getInvoiceRenderData.mockResolvedValue(renderDataOf('15', 1));

        await ctx.service.execute(request());

        expect(ctx.saved.map(file => textOf(file.buffer))).toEqual([
            'Счёт N [15]',
        ]);
    });

    it('пустой номер остаётся пустым у всех счетов, суффиксов нет', async () => {
        const ctx = await setup();
        ctx.getInvoiceRenderData.mockResolvedValue(renderDataOf('', 3));

        await ctx.service.execute(request(), { numberOffset: 1 });

        expect(ctx.saved.map(file => textOf(file.buffer))).toEqual([
            'Счёт N []',
            'Счёт N []',
            'Счёт N []',
        ]);
    });
});

describe('InvoiceWordCoreGenerateService: год папки хранилища', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('год считается на каждый вызов: после Нового года ссылки ведут в новую папку', async () => {
        jest.useFakeTimers({
            now: new Date('2026-12-31T12:00:00'),
            doNotFake: [
                'nextTick',
                'setImmediate',
                'clearImmediate',
                'setTimeout',
                'clearTimeout',
                'setInterval',
                'clearInterval',
                'queueMicrotask',
            ],
        });
        const ctx = await setup();
        ctx.getInvoiceRenderData.mockResolvedValue(renderDataOf('15', 1));

        await ctx.service.execute(request());
        jest.setSystemTime(new Date('2027-01-01T09:00:00'));
        await ctx.service.execute(request());

        expect(ctx.saved.map(file => file.subPath)).toEqual([
            'konstructor/invoice-document/2026/gsr.bitrix24.ru/6',
            'konstructor/invoice-document/2027/gsr.bitrix24.ru/6',
        ]);
        // ссылка строится на тот же год, что и папка
        expect(ctx.createPublicLink.mock.calls.map(call => call[4])).toEqual([
            '2026',
            '2027',
        ]);
    });
});
