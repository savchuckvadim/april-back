jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { InvoiceTemplate } from 'generated/prisma';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService } from '@lib/core/storage/storage.service';
import { SupplyDto } from '@app/konstructor/dto/supply.dto';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { InvoiceTemplateService } from '@app/konstructor/modules/invoice-template';
import { ComplectVariantOfferStageService } from '@app/konstructor/modules/complect-variant-lifecycle/services/complect-variant-offer-stage.service';
import { SalesDocumentFlowService } from '@app/konstructor/modules/sales-document-flow/services/sales-document-flow.service';
import { ComplectModeEnum } from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { InvoiceDataDto } from '@app/konstructor/offer-word/dto/offer-word-generate-request.dto';
import {
    BitrixDocumentSaveFlowService,
    IDocumentSaveFlowData,
    IDocumentSaveFlowResult,
} from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { OfferBxTimelineService } from '@app/konstructor/offer-word/services/bitrix/offer-bx-timeline.service';
import { InvoiceDocumentsBuildService } from '@app/konstructor/offer-word/services/invoice-word-core/invoice-documents-build.service';
import {
    InvoiceTemplateRequest,
    InvoiceTemplateSourceService,
} from '@app/konstructor/offer-word/services/invoice-word-core/invoice-template-source.service';
import { InvoiceWordCoreGenerateService } from '@app/konstructor/offer-word/services/invoice-word-core/invoice-word-core-generate.service';
import {
    OfferWordPdfExportParams,
    OfferWordPdfExportService,
} from '@app/konstructor/offer-word/services/pdf-export/offer-word-pdf-export.service';
import { PdfMergeService } from '@app/konstructor/offer-word/services/pdf-export/pdf-merge.service';
import {
    IInvoiceRenderData,
    InvoiceRenderDataService,
} from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import { InvoiceBuildRequest } from '@app/konstructor/offer-word/types/invoice-build-request.type';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from '../services/offer-pdf-document-model.service';
import { OfferPdfGenerateService } from '../services/offer-pdf-generate.service';
import {
    OfferPdfRenderResult,
    OfferPdfRenderService,
} from '../services/offer-pdf-render.service';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import {
    compositionOf,
    pdfRequestOf,
    variantOf,
} from './fixtures/offer-pdf-variants.fixture';

/**
 * Счёт PDF-КП: сервис КП, общий сервис сборки счетов и core-сервис счетов
 * настоящие, шаблон, данные счёта, диск, Битрикс и перевод в PDF замоканы.
 * Так видно весь путь запроса PDF-КП до подбора шаблона счёта.
 */
const SERVER_BASE = 'https://app.test/api/files';
const BITRIX_LINK = 'https://test.bitrix24.ru/disk/file';
const OFFER_NAME = 'КП Бухгалтерия - Интернет 3 ОД';
const INVOICE_NAME = 'Счёт Бухгалтерия - Интернет 3 ОД';

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

type PriceKind = 'general' | 'alternative';

const priceOf = (setKind: PriceKind, setIndex: number) => ({
    rows: { ProductRows: [] },
    total: {},
    setKind,
    setIndex,
});

interface SetupOptions {
    /** none — шаблона счёта для портала нет */
    template?: 'found' | 'none';
    /** fails — перевод DOCX счёта в PDF бросает ошибку */
    pdfExport?: 'ok' | 'fails';
    /** fails — данные счёта не собираются */
    renderData?: 'ok' | 'fails';
    /** invoice-fallback — Диск принял КП, а счёт остался ссылкой на сервер */
    bitrix?: 'ok' | 'invoice-fallback';
    /** наборы, из которых собираются счета; по умолчанию один основной */
    prices?: Array<ReturnType<typeof priceOf>>;
}

const setup = async ({
    template = 'found',
    pdfExport = 'ok',
    renderData = 'ok',
    bitrix = 'ok',
    prices = [priceOf('general', 0)],
}: SetupOptions = {}) => {
    const build = jest.fn<Promise<OfferPdfDocumentModel>, [unknown]>(() =>
        Promise.resolve(createOfferPdfModelFixture()),
    );
    const render = jest.fn<
        Promise<Partial<OfferPdfRenderResult>>,
        [OfferPdfDocumentModel]
    >(() =>
        Promise.resolve({
            buffer: Buffer.from('pdf:-'),
            durationMs: 40,
            templateCode: OfferPdfTemplateCode.CLASSIC,
            missingAssets: [],
        }),
    );
    const mergeBuffers = jest.fn<Promise<Buffer>, [readonly Uint8Array[]]>(() =>
        Promise.resolve(Buffer.from('merged')),
    );
    const saveFile = jest.fn<Promise<string>, [Buffer, string, string, string]>(
        (_buffer, fileName) => Promise.resolve(`/abs/${fileName}`),
    );
    const readFile = jest.fn<Promise<Buffer>, [string]>(() =>
        Promise.resolve(Buffer.from('счёт-в-байтах')),
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
    const saveDocuments = jest.fn<
        Promise<IDocumentSaveFlowResult>,
        [IDocumentSaveFlowData]
    >(data =>
        Promise.resolve({
            portalFolderId: 1,
            documents: data.documents.map((document, index) => ({
                link:
                    bitrix === 'invoice-fallback' && document.type === 'invoice'
                        ? document.link
                        : `${BITRIX_LINK}/${index + 1}`,
                name: document.name,
                type: document.type,
            })),
            files: [],
        }),
    );
    const sendDocumentToBitrix = jest.fn<
        Promise<void>,
        [{ dealId?: string; documents: unknown[] }]
    >(() => Promise.resolve());
    const markOffer = jest.fn(() => Promise.resolve());

    // подбор шаблона счёта и данные счёта
    const resolveTemplate = jest.fn<Promise<InvoiceTemplate | null>, [unknown]>(
        () => Promise.resolve(template === 'found' ? templateRow : null),
    );
    const getInvoiceRenderData = jest.fn<
        Promise<IInvoiceRenderData>,
        [InvoiceBuildRequest]
    >(() =>
        renderData === 'fails'
            ? Promise.reject(new Error('нет реквизитов поставщика'))
            : Promise.resolve({
                  InvoiceNumber: '15',
                  prices,
              } as unknown as IInvoiceRenderData),
    );
    const buildPublicPdfLink = jest.fn<
        Promise<string>,
        [OfferWordPdfExportParams]
    >(params =>
        pdfExport === 'fails'
            ? Promise.reject(new Error('Gotenberg не отвечает'))
            : Promise.resolve(
                  `${SERVER_BASE}/${params.docxFileName.replace(/\.docx$/i, '.pdf')}`,
              ),
    );

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferPdfGenerateService,
            InvoiceDocumentsBuildService,
            InvoiceWordCoreGenerateService,
            { provide: OfferPdfDocumentModelService, useValue: { build } },
            { provide: OfferPdfRenderService, useValue: { render } },
            { provide: StorageService, useValue: { saveFile, readFile } },
            { provide: FileLinkService, useValue: { createPublicLink } },
            {
                provide: ConfigService,
                useValue: { get: jest.fn(() => 'https://app.test') },
            },
            {
                provide: BitrixDocumentSaveFlowService,
                useValue: { saveDocuments },
            },
            {
                provide: OfferBxTimelineService,
                useValue: { sendDocumentToBitrix },
            },
            {
                provide: SupplyPayloadEnricherService,
                useValue: {
                    enrichWithVariants: jest.fn((dto: OfferPdfGenerateDto) =>
                        Promise.resolve(dto),
                    ),
                },
            },
            { provide: PdfMergeService, useValue: { mergeBuffers } },
            {
                provide: ComplectVariantOfferStageService,
                useValue: { markOffer },
            },
            {
                provide: InvoiceTemplateSourceService,
                useValue: { resolve: resolveTemplate },
            },
            {
                provide: InvoiceTemplateService,
                useValue: { toDto: jest.fn().mockReturnValue({}) },
            },
            {
                provide: InvoiceRenderDataService,
                useValue: { getInvoiceRenderData },
            },
            {
                provide: OfferWordPdfExportService,
                useValue: { buildPublicPdfLink },
            },
            // поток продаж: запросы без salesFlow, событие не ставится
            {
                provide: SalesDocumentFlowService,
                useValue: { publish: jest.fn(() => Promise.resolve(false)) },
            },
        ],
    }).compile();

    // рендер DOCX счёта — настоящий шаблон здесь ни к чему: сохраняем данные, что ушли в рендер
    let invoiceCount = 0;
    const renderSingleInvoice = jest
        .spyOn(
            moduleRef.get(InvoiceWordCoreGenerateService),
            'renderSingleInvoice',
        )
        .mockImplementation(data => {
            invoiceCount += 1;
            return Promise.resolve({
                renderData: data,
                docxPath: `/abs/invoice-${invoiceCount}.docx`,
                resultFileName: `invoice-${invoiceCount}.docx`,
                docxLink: `${SERVER_BASE}/invoice-${invoiceCount}.docx`,
            });
        });

    return {
        service: moduleRef.get(OfferPdfGenerateService),
        saveFile,
        saveDocuments,
        sendDocumentToBitrix,
        markOffer,
        resolveTemplate,
        getInvoiceRenderData,
        renderSingleInvoice,
        buildPublicPdfLink,
        readFile,
    };
};

const invoiceData = (over: Partial<InvoiceDataDto> = {}): InvoiceDataDto =>
    Object.assign(new InvoiceDataDto(), {
        needGeneralInvoice: true,
        needManyInvoices: false,
        isByPresentationInvoices: false,
        invoiceDate: '',
        invoiceNumber: '15',
        ...over,
    });

/** Запрос PDF-КП со счётом: юрлицо-бюджетник, поставщик 12, поставка «internet». */
const requestWithInvoice = (
    over: Partial<OfferPdfGenerateDto> = {},
): OfferPdfGenerateDto =>
    pdfRequestOf({
        providerId: 12,
        clientType: ClientTypeEnum.ORG_STATE,
        supply: Object.assign(new SupplyDto(), { type: 'internet' }),
        invoiceTemplateId: '',
        invoice: invoiceData(),
        ...over,
    });

describe('генерация PDF-КП: счёт', () => {
    it('счёта в запросе нет — он не собирается, ответ как раньше с пустым списком счетов', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(pdfRequestOf());

        expect(ctx.resolveTemplate).not.toHaveBeenCalled();
        expect(ctx.getInvoiceRenderData).not.toHaveBeenCalled();
        expect(result.invoiceLinks).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.links).toHaveLength(1);
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents.map(document => document.type)).toEqual(['offer']);
    });

    it('оба флага счёта выключены — счёт не собирается', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(
            requestWithInvoice({
                invoice: invoiceData({
                    needGeneralInvoice: false,
                    needManyInvoices: false,
                }),
            }),
        );

        expect(ctx.resolveTemplate).not.toHaveBeenCalled();
        expect(result.invoiceLinks).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('предпросмотр счёт не собирает, как бы ни был заполнен invoice', async () => {
        const ctx = await setup();
        await ctx.service.preview(requestWithInvoice());

        expect(ctx.resolveTemplate).not.toHaveBeenCalled();
        expect(ctx.getInvoiceRenderData).not.toHaveBeenCalled();
        expect(ctx.saveDocuments).not.toHaveBeenCalled();
    });

    it('счёт собирается после КП, переводится в PDF и описан в invoiceLinks той же формой, что links', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(requestWithInvoice());

        expect(ctx.buildPublicPdfLink).toHaveBeenCalledTimes(1);
        expect(ctx.buildPublicPdfLink.mock.calls[0][0]).toMatchObject({
            docxAbsolutePath: '/abs/invoice-1.docx',
            domain: 'test.bitrix24.ru',
            userId: 15,
            type: 'invoice',
        });
        expect(ctx.readFile).toHaveBeenCalledWith('/abs/invoice-1.pdf');
        expect(result.invoiceLinks).toEqual([
            {
                link: `${SERVER_BASE}/invoice-1.pdf`,
                fileName: 'invoice-1.pdf',
                name: INVOICE_NAME,
                size: Buffer.from('счёт-в-байтах').length,
                bitrixLink: `${BITRIX_LINK}/2`,
            },
        ]);
        // КП по-прежнему в links, а bitrixLink ответа — ссылка на файл КП
        expect(result.links).toHaveLength(1);
        expect(result.links?.[0].name).toBe(OFFER_NAME);
        expect(result.bitrixLink).toBe(`${BITRIX_LINK}/1`);
        expect(result.savedToDeal).toBe(true);
        expect(result.dealMessage).toBeNull();
        expect(result.warnings).toEqual([]);
    });

    it('в сделку КП уходит с типом offer, счёт с типом invoice, одним обращением и одним комментарием таймлайна', async () => {
        const ctx = await setup();
        await ctx.service.generate(requestWithInvoice());

        expect(ctx.saveDocuments).toHaveBeenCalledTimes(1);
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(
            documents.map(({ name, type, absolutePath, diskName }) => ({
                name,
                type,
                absolutePath,
                diskName,
            })),
        ).toEqual([
            {
                name: OFFER_NAME,
                type: 'offer',
                absolutePath: expect.stringMatching(
                    /^\/abs\/offer-[0-9a-f-]{36}\.pdf$/,
                ) as string,
                diskName: expect.stringMatching(/^КП_/) as string,
            },
            {
                name: INVOICE_NAME,
                type: 'invoice',
                absolutePath: '/abs/invoice-1.pdf',
                // номер счёта в запросе — «15»
                diskName: 'Счёт_15',
            },
        ]);
        expect(ctx.sendDocumentToBitrix).toHaveBeenCalledTimes(1);
        const [{ documents: timeline }] =
            ctx.sendDocumentToBitrix.mock.calls[0];
        expect(timeline).toEqual([
            expect.objectContaining({ type: 'offer', name: OFFER_NAME }),
            expect.objectContaining({ type: 'invoice', name: INVOICE_NAME }),
        ]);
    });

    it('счёт на Диск не попал — КП в порядке, у счёта пустой bitrixLink, в ответе причина', async () => {
        const ctx = await setup({ bitrix: 'invoice-fallback' });
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.links?.[0].bitrixLink).toBe(`${BITRIX_LINK}/1`);
        expect(result.invoiceLinks[0].bitrixLink).toBeNull();
        expect(result.savedToDeal).toBe(false);
        expect(result.dealMessage).toContain('1 из 2');
        expect(ctx.sendDocumentToBitrix).toHaveBeenCalledTimes(1);
    });

    it('saveToDeal=false — счёт сделан и отдан ссылкой, в Битрикс не ходим', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(
            requestWithInvoice({ saveToDeal: false }),
        );

        expect(ctx.saveDocuments).not.toHaveBeenCalled();
        expect(ctx.sendDocumentToBitrix).not.toHaveBeenCalled();
        expect(result.invoiceLinks).toHaveLength(1);
        expect(result.invoiceLinks[0].link).toBe(
            `${SERVER_BASE}/invoice-1.pdf`,
        );
        expect(result.invoiceLinks[0].bitrixLink).toBeNull();
    });

    it('шаблона счёта нет — предупреждение, КП и сделка на месте', async () => {
        const ctx = await setup({ template: 'none' });
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.warnings).toEqual([
            'Счёт не сформирован: для портала не найден шаблон счёта',
        ]);
        expect(result.invoiceLinks).toEqual([]);
        expect(result.links).toHaveLength(1);
        expect(result.link).toContain(`${SERVER_BASE}/offer-`);
        expect(ctx.getInvoiceRenderData).not.toHaveBeenCalled();
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents.map(document => document.type)).toEqual(['offer']);
        expect(ctx.markOffer).toHaveBeenCalledTimes(1);
    });

    it('перевод счёта в PDF не удался — остаётся DOCX, КП и счёт отданы, предупреждения нет', async () => {
        const ctx = await setup({ pdfExport: 'fails' });
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.invoiceLinks).toHaveLength(1);
        expect(result.invoiceLinks[0]).toMatchObject({
            link: `${SERVER_BASE}/invoice-1.docx`,
            fileName: 'invoice-1.docx',
            name: INVOICE_NAME,
        });
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents[1]).toMatchObject({
            type: 'invoice',
            absolutePath: '/abs/invoice-1.docx',
        });
        expect(result.warnings).toEqual([]);
    });

    it('сбой сборки счёта не отменяет КП: причина в warnings, в сделку уходит КП', async () => {
        const ctx = await setup({ renderData: 'fails' });
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.warnings).toEqual([
            'Счёт не сформирован: нет реквизитов поставщика',
        ]);
        expect(result.invoiceLinks).toEqual([]);
        expect(result.links).toHaveLength(1);
        expect(result.savedToDeal).toBe(true);
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents.map(document => document.type)).toEqual(['offer']);
        expect(ctx.markOffer).toHaveBeenCalledTimes(1);
    });

    it('размер файла счёта не прочитался — ответ цел, размер 0', async () => {
        const ctx = await setup();
        ctx.readFile.mockRejectedValueOnce(new Error('файла нет'));
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.invoiceLinks[0].size).toBe(0);
        expect(result.warnings).toEqual([]);
    });

    it('наборы для сравнения: счёт на каждый набор, номера N, N-1, N-2', async () => {
        const ctx = await setup({
            prices: [
                priceOf('general', 0),
                priceOf('alternative', 0),
                priceOf('alternative', 1),
            ],
        });
        const result = await ctx.service.generate(
            requestWithInvoice({
                invoice: invoiceData({ needManyInvoices: true }),
            }),
        );

        expect(result.invoiceLinks.map(link => link.fileName)).toEqual([
            'invoice-1.pdf',
            'invoice-2.pdf',
            'invoice-3.pdf',
        ]);
        expect(
            ctx.renderSingleInvoice.mock.calls.map(
                ([data]) => data.InvoiceNumber,
            ),
        ).toEqual(['15', '15-1', '15-2']);
    });
});

describe('генерация PDF-КП: подбор шаблона счёта', () => {
    it.each([
        ClientTypeEnum.ORG,
        ClientTypeEnum.ORG_STATE,
        ClientTypeEnum.IP,
        ClientTypeEnum.FIZ,
    ])(
        'в подбор идут домен, поставщик, тип клиента (%s) и вид поставки из запроса PDF',
        async clientType => {
            const ctx = await setup();
            await ctx.service.generate(requestWithInvoice({ clientType }));

            expect(ctx.resolveTemplate).toHaveBeenCalledTimes(1);
            const [request] = ctx.resolveTemplate.mock.calls[0] as [
                InvoiceTemplateRequest,
            ];
            expect(request).toMatchObject({
                domain: 'test.bitrix24.ru',
                providerId: 12,
                clientType,
                invoiceTemplateId: '',
            });
            expect(request.supply?.type).toBe('internet');
        },
    );

    it('явный invoiceTemplateId доходит до подбора', async () => {
        const ctx = await setup();
        await ctx.service.generate(
            requestWithInvoice({ invoiceTemplateId: 'tpl-77' }),
        );

        expect(ctx.resolveTemplate).toHaveBeenCalledWith(
            expect.objectContaining({ invoiceTemplateId: 'tpl-77' }),
        );
    });

    it('invoiceTemplateId не передан — шаблон подбирается сам', async () => {
        const ctx = await setup();
        await ctx.service.generate(
            requestWithInvoice({ invoiceTemplateId: undefined }),
        );

        expect(ctx.resolveTemplate).toHaveBeenCalledTimes(1);
        const [request] = ctx.resolveTemplate.mock.calls[0] as [
            { invoiceTemplateId?: string },
        ];
        expect(request.invoiceTemplateId).toBeUndefined();
    });

    it('данные счёта собираются из полей запроса: получатель, поставщик, наборы, счёт', async () => {
        const ctx = await setup();
        const dto = requestWithInvoice({
            recipient: { name: 'Иван Иванов', inn: '7700000000' },
        });
        await ctx.service.generate(dto);

        expect(ctx.getInvoiceRenderData).toHaveBeenCalledTimes(1);
        const [request] = ctx.getInvoiceRenderData.mock.calls[0];
        expect(request).toMatchObject({
            domain: 'test.bitrix24.ru',
            userId: 15,
            providerId: 12,
            clientType: ClientTypeEnum.ORG_STATE,
            contractType: dto.contractType,
            recipient: { name: 'Иван Иванов', inn: '7700000000' },
        });
        expect(request.sets).toBe(dto.sets);
        expect(request.invoice).toBe(dto.invoice);
    });

    it('у запроса с вариантами счёт строится по открытому (первому) варианту', async () => {
        const ctx = await setup();
        const variants = [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)];
        const result = await ctx.service.generate(
            requestWithInvoice({
                variants,
                composition: compositionOf(ComplectModeEnum.COMPARE),
            }),
        );

        expect(ctx.getInvoiceRenderData).toHaveBeenCalledTimes(1);
        const [request] = ctx.getInvoiceRenderData.mock.calls[0];
        expect(request.sets).toBe(variants[0].sets);
        expect(request.contractType).toBe(variants[0].contractType);
        expect(result.invoiceLinks).toHaveLength(1);
        expect(result.invoiceLinks[0].name).toBe('Счёт Юрист - Интернет 3 ОД');
    });

    it('несколько вариантов в режиме multi_contract: счёт всё равно один, по открытому варианту', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(
            requestWithInvoice({
                variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
                composition: compositionOf(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(ctx.getInvoiceRenderData).toHaveBeenCalledTimes(1);
        expect(result.invoiceLinks).toHaveLength(1);
    });
});
