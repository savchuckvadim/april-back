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
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { ComplectVariantOfferStageService } from '@app/konstructor/modules/complect-variant-lifecycle/services/complect-variant-offer-stage.service';
import { SalesDocumentFlowService } from '@app/konstructor/modules/sales-document-flow/services/sales-document-flow.service';
import {
    DispatchMock,
    eventOfCall,
    failingDispatch,
    okDispatch,
} from '@app/konstructor/modules/sales-document-flow/__tests__/sales-document.fixtures';
import { InvoiceDataDto } from '@app/konstructor/offer-word/dto/offer-word-generate-request.dto';
import { IPreparedDocument } from '@app/konstructor/offer-word/interface/document.interface';
import {
    BitrixDocumentSaveFlowService,
    IDocumentSaveFlowData,
    IDocumentSaveFlowResult,
} from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { OfferBxTimelineService } from '@app/konstructor/offer-word/services/bitrix/offer-bx-timeline.service';
import { InvoiceDocumentsBuildService } from '@app/konstructor/offer-word/services/invoice-word-core/invoice-documents-build.service';
import { PdfMergeService } from '@app/konstructor/offer-word/services/pdf-export/pdf-merge.service';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
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
import { ComplectModeEnum } from '@app/konstructor/modules/inner-deal/type/complect-composition.type';

/**
 * Событие в поток продаж event-sales: PDF-КП ставит его только по `salesFlow`
 * из запроса, только когда файлы записаны в сделку (saveToDeal не выключен),
 * и никогда на предпросмотре.
 */
const invoiceDocument: IPreparedDocument = {
    absolutePath: '/abs/invoice-1.pdf',
    link: 'https://app.test/api/files/invoice-1.pdf',
    name: 'Счёт',
    type: 'invoice',
};

interface SetupOptions {
    invoices?: IPreparedDocument[];
    dispatch?: DispatchMock;
    saveDocuments?: jest.Mock;
}

const setup = async (options: SetupOptions = {}) => {
    const dispatch = options.dispatch ?? okDispatch();
    const saveDocuments =
        options.saveDocuments ??
        jest.fn<Promise<IDocumentSaveFlowResult>, [IDocumentSaveFlowData]>(
            data =>
                Promise.resolve({
                    portalFolderId: 1,
                    documents: data.documents.map(document => ({
                        link: 'https://test.bitrix24.ru/disk/file',
                        name: document.name,
                        type: document.type,
                    })),
                    files: [],
                }),
        );
    const buildInvoices = jest
        .fn()
        .mockResolvedValue({ documents: options.invoices ?? [] });

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferPdfGenerateService,
            SalesDocumentFlowService,
            { provide: QueueDispatcherService, useValue: { dispatch } },
            {
                provide: OfferPdfDocumentModelService,
                useValue: {
                    build: jest.fn(() =>
                        Promise.resolve(
                            createOfferPdfModelFixture({
                                variantTitle: null,
                            }),
                        ),
                    ),
                },
            },
            {
                provide: OfferPdfRenderService,
                useValue: {
                    render: jest.fn(() =>
                        Promise.resolve({
                            buffer: Buffer.from('pdf'),
                            durationMs: 1,
                            templateCode: OfferPdfTemplateCode.CLASSIC,
                            missingAssets: [],
                        } satisfies Partial<OfferPdfRenderResult>),
                    ),
                },
            },
            {
                provide: StorageService,
                useValue: {
                    saveFile: jest.fn((_buffer: Buffer, fileName: string) =>
                        Promise.resolve(`/abs/${fileName}`),
                    ),
                    readFile: jest.fn(() => Promise.resolve(Buffer.from('pdf'))),
                },
            },
            {
                provide: FileLinkService,
                useValue: {
                    createPublicLink: jest.fn(
                        (
                            _domain: string,
                            _userId: number,
                            _app: string,
                            _sub: string,
                            _year: string,
                            fileName: string,
                        ) => Promise.resolve(`/api/files/${fileName}`),
                    ),
                },
            },
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
                useValue: {
                    sendDocumentToBitrix: jest.fn(() => Promise.resolve()),
                },
            },
            {
                provide: SupplyPayloadEnricherService,
                useValue: {
                    enrichWithVariants: jest.fn((dto: OfferPdfGenerateDto) =>
                        Promise.resolve(dto),
                    ),
                },
            },
            {
                provide: PdfMergeService,
                useValue: {
                    mergeBuffers: jest.fn(() => Promise.resolve(Buffer.from('m'))),
                },
            },
            {
                provide: ComplectVariantOfferStageService,
                useValue: { markOffer: jest.fn(() => Promise.resolve()) },
            },
            {
                provide: InvoiceDocumentsBuildService,
                useValue: { build: buildInvoices },
            },
        ],
    }).compile();

    return {
        service: moduleRef.get(OfferPdfGenerateService),
        dispatch,
        saveDocuments,
    };
};

const withInvoiceFlag = (): InvoiceDataDto =>
    Object.assign(new InvoiceDataDto(), {
        needGeneralInvoice: true,
        needManyInvoices: false,
        isByPresentationInvoices: false,
        invoiceDate: '',
        invoiceNumber: '15',
    });

describe('PDF-КП: событие в поток продаж', () => {
    it('salesFlow: true, КП без счёта: одно событие offer в очередь потока документов', async () => {
        const { service, dispatch } = await setup();

        await service.generate(pdfRequestOf({ salesFlow: true }));

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch.mock.calls[0][0]).toBe(
            QueueNames.EVENT_SALES_DOCUMENT_FLOW,
        );
        expect(dispatch.mock.calls[0][1]).toBe(
            JobNames.EVENT_SALES_DOCUMENT_FLOW,
        );
        const event = eventOfCall(dispatch);
        expect(dispatch.mock.calls[0][3]).toBe(
            `sales-document:${event.eventId}`,
        );
        expect(event).toMatchObject({
            domain: 'test.bitrix24.ru',
            userId: 15,
            companyId: 7,
            dealId: 100,
            kinds: ['offer'],
            sum: 500,
            summary: 'КП: Бухгалтерия, Интернет 3 ОД, 500 ₽',
        });
        expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
        expect(event).not.toHaveProperty('presentation');
    });

    it('счета собраны: в событии два вида, offer и invoice', async () => {
        const { service, dispatch } = await setup({
            invoices: [invoiceDocument],
        });

        await service.generate(
            pdfRequestOf({ salesFlow: true, invoice: withInvoiceFlag() }),
        );

        expect(eventOfCall(dispatch).kinds).toEqual(['offer', 'invoice']);
    });

    it('счёт запрошен, но не собрался: вид invoice не добавляется', async () => {
        const { service, dispatch } = await setup({ invoices: [] });

        await service.generate(
            pdfRequestOf({ salesFlow: true, invoice: withInvoiceFlag() }),
        );

        expect(eventOfCall(dispatch).kinds).toEqual(['offer']);
    });

    it('без salesFlow событие не ставится', async () => {
        const { service, dispatch } = await setup({
            invoices: [invoiceDocument],
        });

        await service.generate(pdfRequestOf());
        await service.generate(pdfRequestOf({ salesFlow: false }));

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('saveToDeal: false: документ в сделку не пишется и событие не ставится', async () => {
        const { service, dispatch, saveDocuments } = await setup();

        await service.generate(
            pdfRequestOf({ salesFlow: true, saveToDeal: false }),
        );

        expect(saveDocuments).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('запись в сделку не удалась: события нет', async () => {
        const { service, dispatch } = await setup({
            saveDocuments: jest
                .fn()
                .mockRejectedValue(new Error('нет доступа к Диску')),
        });

        const result = await service.generate(pdfRequestOf({ salesFlow: true }));

        expect(result.savedToDeal).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('предпросмотр ничего не ставит', async () => {
        const { service, dispatch } = await setup();

        await service.preview(pdfRequestOf({ salesFlow: true }));

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('presentation: пустой объект и блок с dealId уходят в событие как есть', async () => {
        const { service, dispatch } = await setup();

        await service.generate(
            pdfRequestOf({ salesFlow: true, presentation: {} }),
        );
        await service.generate(
            pdfRequestOf({ salesFlow: true, presentation: { dealId: 4321 } }),
        );

        expect(eventOfCall(dispatch, 0).presentation).toEqual({});
        expect(eventOfCall(dispatch, 1).presentation).toEqual({ dealId: 4321 });
    });

    it('сбой постановки не роняет генерацию: ответ с файлом', async () => {
        const { service } = await setup({
            dispatch: failingDispatch('Redis недоступен'),
        });

        const result = await service.generate(pdfRequestOf({ salesFlow: true }));

        expect(result.link).toMatch(/\/api\/files\/offer-.*\.pdf$/);
        expect(result.savedToDeal).toBe(true);
    });

    it('несколько участников: одно событие, сумма и текст по всем документам', async () => {
        const { service, dispatch } = await setup();

        await service.generate(
            pdfRequestOf({
                salesFlow: true,
                variants: [
                    variantOf('Юрист', 11, { sum: 12000 }),
                    variantOf('Бухгалтер', 12, { sum: 6000 }),
                ],
                composition: compositionOf(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(eventOfCall(dispatch).sum).toBe(18000);
        expect(eventOfCall(dispatch).summary).toBe(
            'КП: Юрист, Интернет 3 ОД; Бухгалтер, Интернет 3 ОД, 18 000 ₽',
        );
    });
});
