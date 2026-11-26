import { Test } from '@nestjs/testing';
import { PBXService } from '@lib/pbx';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { SALES_DOCUMENT_EVENT_ATTEMPTS } from '@lib/queue/constants/sales-document-event-job';
import { InnerDealService } from '@app/konstructor/modules/inner-deal/services/inner-deal.service';
import { OfferTemplateService } from '@app/konstructor/modules/offer-template/offer-template';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { SalesDocumentFlowService } from '@app/konstructor/modules/sales-document-flow/services/sales-document-flow.service';
import {
    DispatchMock,
    eventOfCall,
    failingDispatch,
    okDispatch,
} from '@app/konstructor/modules/sales-document-flow/__tests__/sales-document.fixtures';
import {
    garantSet,
    offerSource,
    priceRow,
} from '@app/konstructor/modules/sales-document-flow/__tests__/sales-document.fixtures';
import { IPreparedDocument } from '../interface/document.interface';
import {
    BitrixDocumentSaveFlowService,
    IDocumentSaveFlowResult,
} from '../services/bitrix/bitrix-document-save-flow.service';
import { OfferBxTimelineService } from '../services/bitrix/offer-bx-timeline.service';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';
import {
    IOfferWordMultiBuildResult,
    OfferWordMultiBuildService,
} from '../multi/services/offer-word-multi-build.service';
import { OfferWordMultiSupplyEnrichService } from '../multi/services/offer-word-multi-supply-enrich.service';
import { OfferWordMultiGenerateUseCase } from '../multi/use-cases/offer-word-multi-generate.use-case';

/**
 * Событие в поток продаж event-sales: КП v2 ставит его только по `salesFlow`
 * из запроса и только после записи документов в сделку и таймлайн.
 */
const offer: IPreparedDocument = {
    link: 'https://pdf/offer.pdf',
    name: 'КП Гарант-Максимум',
    type: 'offer',
    absolutePath: '/tmp/offer.pdf',
};
const invoice: IPreparedDocument = {
    link: 'https://pdf/invoice.pdf',
    name: 'Счёт',
    type: 'invoice',
    absolutePath: '/tmp/invoice.pdf',
};

const buildResultOf = (
    invoices: IPreparedDocument[],
): IOfferWordMultiBuildResult => ({
    template: new WordTemplate({}),
    renderData: {},
    offer,
    offers: [offer],
    invoices,
    warnings: [],
    mode: 'single',
});

const saveResultOf = (withInvoice: boolean): IDocumentSaveFlowResult => ({
    portalFolderId: 5,
    documents: [
        { link: offer.link, name: offer.name, type: 'offer' },
        ...(withInvoice
            ? [{ link: invoice.link, name: invoice.name, type: 'invoice' }]
            : []),
    ] as IDocumentSaveFlowResult['documents'],
    files: [],
});

/** Запрос одиночного КП: одна строка общего набора, итог 12 000 ₽. */
const requestOf = (
    extra: Partial<OfferWordMultiGenerateDto> = {},
): OfferWordMultiGenerateDto => {
    const source = offerSource({
        name: 'Гарант-Максимум',
        supply: 'Интернет 5 ОД',
        list: 1200,
        current: 1000,
        quantity: 12,
        measureCode: 15,
    });
    return Object.assign(new OfferWordMultiGenerateDto(), {
        templateId: '1',
        domain: 'garant.bitrix24.ru',
        companyId: '32442',
        dealId: '35018',
        userId: 6,
        variants: [],
        supply: source.supply,
        rows: [
            ...(source.rows ?? []),
            priceRow({ name: 'Для сравнения', type: 'alternative' }),
        ],
        sets: { general: [garantSet(...(source.rows ?? []))], alternative: [] },
        total: source.total,
        ...extra,
    });
};

interface SetupOptions {
    withInvoice?: boolean;
    dispatch?: DispatchMock;
    saveDocuments?: jest.Mock;
}

const setup = async (options: SetupOptions = {}) => {
    const withInvoice = options.withInvoice ?? false;
    const dispatch = options.dispatch ?? okDispatch();
    const saveDocuments =
        options.saveDocuments ??
        jest.fn().mockResolvedValue(saveResultOf(withInvoice));
    const sendDocumentToBitrix = jest.fn().mockResolvedValue(undefined);
    const sendErrorToBitrix = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferWordMultiGenerateUseCase,
            SalesDocumentFlowService,
            { provide: QueueDispatcherService, useValue: { dispatch } },
            { provide: PBXService, useValue: {} },
            {
                provide: OfferWordMultiBuildService,
                useValue: {
                    build: jest
                        .fn()
                        .mockResolvedValue(
                            buildResultOf(withInvoice ? [invoice] : []),
                        ),
                },
            },
            {
                provide: OfferWordMultiSupplyEnrichService,
                useValue: {
                    enrich: jest.fn((dto: OfferWordMultiGenerateDto) =>
                        Promise.resolve(dto),
                    ),
                },
            },
            {
                provide: InnerDealService,
                useValue: {
                    setOfferTemplateByDomainAndDealId: jest
                        .fn()
                        .mockResolvedValue(undefined),
                },
            },
            {
                provide: OfferBxTimelineService,
                useValue: { sendDocumentToBitrix, sendErrorToBitrix },
            },
            {
                provide: BitrixDocumentSaveFlowService,
                useValue: { saveDocuments },
            },
            {
                provide: OfferWordCoreGenerateService,
                useValue: {
                    removeSavedDocx: jest.fn().mockResolvedValue(undefined),
                },
            },
            {
                provide: OfferTemplateService,
                useValue: {
                    incrementTemplateCounter: jest
                        .fn()
                        .mockResolvedValue(undefined),
                },
            },
        ],
    }).compile();

    return {
        useCase: moduleRef.get(OfferWordMultiGenerateUseCase),
        dispatch,
        saveDocuments,
        sendDocumentToBitrix,
    };
};

describe('КП v2: событие в поток продаж', () => {
    it('salesFlow: true, КП без счёта: одно событие offer с номером операции', async () => {
        const { useCase, dispatch } = await setup();

        await useCase.execute(requestOf({ salesFlow: true }), {
            operationId: 'op-1',
        });

        expect(dispatch).toHaveBeenCalledTimes(1);
        const [queue, job, , jobId, options] = dispatch.mock.calls[0] as [
            QueueNames,
            JobNames,
            unknown,
            string,
            { attempts: number },
        ];
        expect(queue).toBe(QueueNames.EVENT_SALES_DOCUMENT_FLOW);
        expect(job).toBe(JobNames.EVENT_SALES_DOCUMENT_FLOW);
        expect(jobId).toBe('sales-document:op-1');
        expect(options).toEqual({ attempts: SALES_DOCUMENT_EVENT_ATTEMPTS });
        expect(eventOfCall(dispatch)).toMatchObject({
            eventId: 'op-1',
            domain: 'garant.bitrix24.ru',
            userId: 6,
            companyId: 32442,
            dealId: 35018,
            kinds: ['offer'],
            sum: 12000,
            summary: 'КП: Гарант-Максимум, Интернет 5 ОД, 12 000 ₽',
        });
        expect(eventOfCall(dispatch)).not.toHaveProperty('presentation');
        expect(eventOfCall(dispatch)).not.toHaveProperty('productRows');
    });

    it('счета собраны и сохранены: в событии два вида, offer и invoice', async () => {
        const { useCase, dispatch } = await setup({ withInvoice: true });

        await useCase.execute(requestOf({ salesFlow: true }), {
            operationId: 'op-2',
        });

        expect(eventOfCall(dispatch).kinds).toEqual(['offer', 'invoice']);
    });

    it('без salesFlow событие не ставится', async () => {
        const { useCase, dispatch } = await setup({ withInvoice: true });

        await useCase.execute(requestOf(), { operationId: 'op-3' });
        await useCase.execute(requestOf({ salesFlow: false }), {
            operationId: 'op-4',
        });

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('синхронный путь без operationId: номер события — новый UUID', async () => {
        const { useCase, dispatch } = await setup();

        await useCase.execute(requestOf({ salesFlow: true }));

        expect(eventOfCall(dispatch).eventId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('presentation: пустой объект уходит в событие пустым', async () => {
        const { useCase, dispatch } = await setup();

        await useCase.execute(requestOf({ salesFlow: true, presentation: {} }), {
            operationId: 'op-5',
        });

        expect(eventOfCall(dispatch).presentation).toEqual({});
    });

    it('presentation с dealId: блок и товарные строки общего набора', async () => {
        const { useCase, dispatch } = await setup();

        await useCase.execute(
            requestOf({ salesFlow: true, presentation: { dealId: 4321 } }),
            { operationId: 'op-6' },
        );

        const event = eventOfCall(dispatch);
        expect(event.presentation).toEqual({ dealId: 4321 });
        // набор «для сравнения» в строки не входит
        expect(event.productRows).toEqual([
            {
                productName: 'Гарант-Максимум',
                price: 1000,
                quantity: 12,
                priceNetto: 1200,
                discountSum: 200,
                discountTypeId: 1,
                measureCode: '15',
                measureId: 15,
                sort: 0,
            },
        ]);
    });

    it('событие ставится после записи документов в сделку и таймлайн', async () => {
        const { useCase, dispatch, saveDocuments, sendDocumentToBitrix } =
            await setup();

        await useCase.execute(requestOf({ salesFlow: true }), {
            operationId: 'op-7',
        });

        const saved = saveDocuments.mock.invocationCallOrder[0];
        const timeline = sendDocumentToBitrix.mock.invocationCallOrder[0];
        const published = dispatch.mock.invocationCallOrder[0];
        expect(saved).toBeLessThan(timeline);
        expect(timeline).toBeLessThan(published);
    });

    it('сбой постановки не роняет генерацию: ссылки возвращаются', async () => {
        const { useCase } = await setup({
            dispatch: failingDispatch('Redis недоступен'),
        });

        const result = await useCase.execute(requestOf({ salesFlow: true }), {
            operationId: 'op-8',
        });

        expect(result.link.link).toBe(offer.link);
    });

    it('документы не сохранились: событие не ставится', async () => {
        const { useCase, dispatch } = await setup({
            saveDocuments: jest.fn().mockRejectedValue(new Error('Диск недоступен')),
        });

        await expect(
            useCase.execute(requestOf({ salesFlow: true }), {
                operationId: 'op-9',
            }),
        ).rejects.toThrow('Диск недоступен');

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('несколько участников независимо: сумма и текст по всем документам', async () => {
        const { useCase, dispatch } = await setup();
        const first = offerSource({
            name: 'Максимум',
            supply: 'Интернет 5 ОД',
            totalSum: 12000,
        });
        const second = offerSource({
            name: 'Оптимум',
            supply: 'Интернет 1 ОД',
            totalSum: 6000,
        });
        const variantOf = (
            source: typeof first,
            title: string,
        ): OfferWordMultiGenerateDto['variants'][number] =>
            ({
                variantSmartId: null,
                title,
                contractType: 'abon',
                complect: [],
                contract: {},
                supply: source.supply,
                rows: source.rows,
                sets: { general: source.sets?.general, alternative: [] },
                total: source.total,
            }) as unknown as OfferWordMultiGenerateDto['variants'][number];

        await useCase.execute(
            requestOf({
                salesFlow: true,
                variants: [variantOf(first, 'Максимум'), variantOf(second, 'Оптимум')],
                composition: {
                    mode: 'multi_contract',
                    offer: {
                        infoblocks: 'independent',
                        showAlternatives: false,
                        separateDocuments: true,
                    },
                    openVariantSmartId: null,
                } as unknown as OfferWordMultiGenerateDto['composition'],
            }),
            { operationId: 'op-10' },
        );

        const event = eventOfCall(dispatch);
        expect(event.sum).toBe(18000);
        expect(event.summary).toBe(
            'КП: Максимум, Интернет 5 ОД; Оптимум, Интернет 1 ОД, 18 000 ₽',
        );
    });
});
