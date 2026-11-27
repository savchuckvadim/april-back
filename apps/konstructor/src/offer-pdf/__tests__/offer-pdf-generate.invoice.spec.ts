jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService } from '@lib/core/storage/storage.service';
import { ProviderImageService } from '@lib/portal-lib/konstructor';
import { ProviderService } from '@lib/portal-lib/konstructor/provider';
import { SupplyDto } from '@app/konstructor/dto/supply.dto';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
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
import { PdfMergeService } from '@app/konstructor/offer-word/services/pdf-export/pdf-merge.service';
import {
    IInvoiceRenderData,
    InvoiceRenderDataService,
} from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import { InvoiceBuildRequest } from '@app/konstructor/offer-word/types/invoice-build-request.type';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { InvoicePdfModel } from '../invoice/model/invoice-pdf.model';
import { InvoicePdfBuildService } from '../invoice/services/invoice-pdf-build.service';
import { InvoicePdfModelService } from '../invoice/services/invoice-pdf-model.service';
import {
    InvoicePdfRenderResult,
    InvoicePdfRenderService,
} from '../invoice/services/invoice-pdf-render.service';
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
 * Счёт PDF-КП: сервис КП и сервисы счёта в PDF настоящие, данные счёта,
 * реквизиты, картинки, рендер react-pdf, диск и Битрикс замоканы. Так видно
 * весь путь запроса PDF-КП до готового файла счёта. Word-шаблона и перевода
 * через LibreOffice в этом пути нет: провайдеров для них в модуле теста не
 * заведено, и случайное обращение к ним падало бы при сборке модуля.
 */
const SERVER_BASE = 'https://app.test/api/files';
const BITRIX_LINK = 'https://test.bitrix24.ru/disk/file';
const OFFER_NAME = 'КП Бухгалтерия - Интернет 3 ОД';
const INVOICE_NAME = 'Счёт Бухгалтерия - Интернет 3 ОД';
const RQ_ID = 77;

type PriceKind = 'general' | 'alternative';

const priceOf = (setKind: PriceKind, setIndex: number) => ({
    rows: { ProductRows: [] },
    total: {},
    setKind,
    setIndex,
});

interface SetupOptions {
    /** none — у поставщика нет реквизитов */
    rq?: 'found' | 'none';
    /** fails — рендер PDF счёта бросает ошибку */
    render?: 'ok' | 'fails';
    /** fails — данные счёта не собираются */
    renderData?: 'ok' | 'fails';
    /** fails — картинки поставщика не читаются (нет таблицы до миграции) */
    images?: 'ok' | 'fails';
    /** invoice-fallback — Диск принял КП, а счёт остался ссылкой на сервер */
    bitrix?: 'ok' | 'invoice-fallback';
    /** наборы, из которых собираются счета; по умолчанию один основной */
    prices?: Array<ReturnType<typeof priceOf>>;
}

const setup = async ({
    rq = 'found',
    render: renderMode = 'ok',
    renderData = 'ok',
    images = 'ok',
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

    // данные счёта, реквизиты, картинки
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
    const findProvider = jest.fn(() =>
        Promise.resolve(
            rq === 'found'
                ? {
                      id: RQ_ID,
                      type: 'org',
                      fullname: 'ООО «Ромашка»',
                      position: 'Директор',
                      director: 'Иванов Иван Иванович',
                  }
                : null,
        ),
    );
    const loadContents = jest.fn<Promise<unknown[]>, [number, string[]]>(() =>
        images === 'fails'
            ? Promise.reject(new Error('нет таблицы provider_images'))
            : Promise.resolve([]),
    );
    // рендер PDF счёта: настоящая раскладка react-pdf под jest не грузится
    const invoiceRender = jest.fn<
        Promise<Partial<InvoicePdfRenderResult>>,
        [InvoicePdfModel]
    >(() =>
        renderMode === 'fails'
            ? Promise.reject(new Error('react-pdf не отрисовал счёт'))
            : Promise.resolve({
                  buffer: Buffer.from('pdf:invoice'),
                  durationMs: 12,
              }),
    );

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferPdfGenerateService,
            InvoicePdfBuildService,
            InvoicePdfModelService,
            { provide: OfferPdfDocumentModelService, useValue: { build } },
            { provide: OfferPdfRenderService, useValue: { render } },
            {
                provide: InvoicePdfRenderService,
                useValue: { render: invoiceRender },
            },
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
                provide: InvoiceRenderDataService,
                useValue: { getInvoiceRenderData },
            },
            { provide: ProviderService, useValue: { findById: findProvider } },
            { provide: ProviderImageService, useValue: { loadContents } },
            // поток продаж: запросы без salesFlow, событие не ставится
            {
                provide: SalesDocumentFlowService,
                useValue: { publish: jest.fn(() => Promise.resolve(false)) },
            },
        ],
    }).compile();

    return {
        service: moduleRef.get(OfferPdfGenerateService),
        saveFile,
        saveDocuments,
        sendDocumentToBitrix,
        markOffer,
        getInvoiceRenderData,
        findProvider,
        loadContents,
        invoiceRender,
        createPublicLink,
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

        expect(ctx.getInvoiceRenderData).not.toHaveBeenCalled();
        expect(ctx.invoiceRender).not.toHaveBeenCalled();
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

        expect(ctx.getInvoiceRenderData).not.toHaveBeenCalled();
        expect(ctx.invoiceRender).not.toHaveBeenCalled();
        expect(result.invoiceLinks).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('предпросмотр счёт не собирает, как бы ни был заполнен invoice', async () => {
        const ctx = await setup();
        await ctx.service.preview(requestWithInvoice());

        expect(ctx.getInvoiceRenderData).not.toHaveBeenCalled();
        expect(ctx.invoiceRender).not.toHaveBeenCalled();
        expect(ctx.saveDocuments).not.toHaveBeenCalled();
    });

    it('счёт рисуется сразу в PDF и описан в invoiceLinks той же формой, что links', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(requestWithInvoice());

        expect(ctx.invoiceRender).toHaveBeenCalledTimes(1);
        // файл счёта — PDF с серверным именем, в той же папке хранилища, что Word-счета
        const invoiceSave = ctx.saveFile.mock.calls.find(([, name]) =>
            name.startsWith('invoice-'),
        );
        expect(invoiceSave?.[0].toString()).toBe('pdf:invoice');
        expect(invoiceSave?.[1]).toMatch(/^invoice-[0-9a-f-]{36}\.pdf$/);
        expect(invoiceSave?.[3]).toMatch(
            /^konstructor\/invoice-document\/\d{4}\/test\.bitrix24\.ru\/15$/,
        );
        expect(ctx.createPublicLink).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            15,
            'konstructor',
            'invoice-document',
            expect.stringMatching(/^\d{4}$/) as string,
            invoiceSave?.[1],
        );
        expect(ctx.readFile).toHaveBeenCalledWith(`/abs/${invoiceSave?.[1]}`);
        expect(result.invoiceLinks).toEqual([
            {
                link: `${SERVER_BASE}/${invoiceSave?.[1]}`,
                fileName: invoiceSave?.[1],
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

    it('в сделку КП уходит с типом offer, счёт с типом invoice и именем «Счёт_<номер>», одним обращением и одним комментарием таймлайна', async () => {
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
                absolutePath: expect.stringMatching(
                    /^\/abs\/invoice-[0-9a-f-]{36}\.pdf$/,
                ) as string,
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
        expect(result.invoiceLinks[0].link).toMatch(
            new RegExp(`^${SERVER_BASE}/invoice-[0-9a-f-]{36}\\.pdf$`),
        );
        expect(result.invoiceLinks[0].bitrixLink).toBeNull();
    });

    it('у поставщика нет реквизитов — предупреждение, КП и сделка на месте', async () => {
        const ctx = await setup({ rq: 'none' });
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.warnings).toEqual([
            'Счёт не сформирован: не найдены реквизиты поставщика',
        ]);
        expect(result.invoiceLinks).toEqual([]);
        expect(result.links).toHaveLength(1);
        expect(result.link).toContain(`${SERVER_BASE}/offer-`);
        expect(ctx.getInvoiceRenderData).not.toHaveBeenCalled();
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents.map(document => document.type)).toEqual(['offer']);
        expect(ctx.markOffer).toHaveBeenCalledTimes(1);
    });

    it('сбой сборки данных счёта не отменяет КП: причина в warnings, в сделку уходит КП', async () => {
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

    it('сбой рендера PDF счёта не отменяет КП: причина в warnings', async () => {
        const ctx = await setup({ render: 'fails' });
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.warnings).toEqual([
            'Счёт не сформирован: react-pdf не отрисовал счёт',
        ]);
        expect(result.invoiceLinks).toEqual([]);
        expect(result.links).toHaveLength(1);
        const [{ documents }] = ctx.saveDocuments.mock.calls[0];
        expect(documents.map(document => document.type)).toEqual(['offer']);
    });

    it('картинки поставщика не читаются — счёт всё равно собран, без картинок', async () => {
        const ctx = await setup({ images: 'fails' });
        const result = await ctx.service.generate(requestWithInvoice());

        expect(result.warnings).toEqual([]);
        expect(result.invoiceLinks).toHaveLength(1);
        const [model] = ctx.invoiceRender.mock.calls[0];
        expect(model.images).toEqual({});
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

        expect(result.invoiceLinks).toHaveLength(3);
        expect(
            result.invoiceLinks.every(link => /\.pdf$/.test(link.fileName)),
        ).toBe(true);
        expect(
            ctx.invoiceRender.mock.calls.map(
                ([model]) => model.data.InvoiceNumber,
            ),
        ).toEqual(['15', '15-1', '15-2']);
    });
});

describe('генерация PDF-КП: данные счёта', () => {
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
        // реквизиты читаются по поставщику запроса
        expect(ctx.findProvider).toHaveBeenCalledWith(12);
    });

    it('invoiceTemplateId в запросе не нужен: Word-шаблон счёта не подбирается и не читается', async () => {
        const ctx = await setup();
        const result = await ctx.service.generate(
            requestWithInvoice({ invoiceTemplateId: 'tpl-77' }),
        );

        expect(result.invoiceLinks).toHaveLength(1);
        const [request] = ctx.getInvoiceRenderData.mock.calls[0];
        expect(request).not.toHaveProperty('invoiceTemplateId');
    });

    it('настройка КП showDiscount на счёт не влияет: модель счёта та же, скидка в нём остаётся', async () => {
        const shown = await setup();
        await shown.service.generate(
            requestWithInvoice({ settings: { showDiscount: true } }),
        );
        const hidden = await setup();
        await hidden.service.generate(
            requestWithInvoice({ settings: { showDiscount: false } }),
        );

        expect(hidden.invoiceRender.mock.calls[0][0]).toEqual(
            shown.invoiceRender.mock.calls[0][0],
        );
        // у модели счёта нет настроек КП: колонку «Скидка» решают строки счёта
        expect(hidden.invoiceRender.mock.calls[0][0]).not.toHaveProperty(
            'settings',
        );
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

describe('генерация PDF-КП: печати, подписи и QR в счёте', () => {
    const rqImage = (role: string) => ({
        role,
        format: 'png' as const,
        data: Buffer.from(`png:${role}`),
    });

    it('по умолчанию читаются печать, подписи и QR: настройка withStamps включена', async () => {
        const ctx = await setup();
        ctx.loadContents.mockResolvedValueOnce([
            rqImage('stamp'),
            rqImage('signature_director'),
            rqImage('qr'),
        ]);
        await ctx.service.generate(requestWithInvoice());

        expect(ctx.loadContents).toHaveBeenCalledWith(RQ_ID, [
            'stamp',
            'signature_director',
            'signature_accountant',
            'qr',
        ]);
        const [model] = ctx.invoiceRender.mock.calls[0];
        expect(Object.keys(model.images).sort()).toEqual([
            'qr',
            'signatureDirector',
            'stamp',
        ]);
        expect(model.signer).not.toBeNull();
    });

    it('withStamps=false: читается только QR, блока подписей и печати нет', async () => {
        const ctx = await setup();
        ctx.loadContents.mockResolvedValueOnce([rqImage('qr')]);
        await ctx.service.generate(
            requestWithInvoice({ settings: { withStamps: false } }),
        );

        expect(ctx.loadContents).toHaveBeenCalledWith(RQ_ID, ['qr']);
        const [model] = ctx.invoiceRender.mock.calls[0];
        expect(Object.keys(model.images)).toEqual(['qr']);
        expect(model.signer).toBeNull();
    });

    it('QR у реквизитов нет — в модели счёта его нет', async () => {
        const ctx = await setup();
        ctx.loadContents.mockResolvedValueOnce([rqImage('stamp')]);
        await ctx.service.generate(requestWithInvoice());

        const [model] = ctx.invoiceRender.mock.calls[0];
        expect(model.images.qr).toBeUndefined();
        expect(model.images.stamp).toBeDefined();
    });

    it('withStamps не зависит от письма: счёт печатает печать и без письма в КП', async () => {
        const ctx = await setup();
        ctx.loadContents.mockResolvedValueOnce([rqImage('stamp')]);
        await ctx.service.generate(
            requestWithInvoice({ settings: { withLetter: false } }),
        );

        const [model] = ctx.invoiceRender.mock.calls[0];
        expect(model.images.stamp).toBeDefined();
        expect(model.signer).not.toBeNull();
    });
});
