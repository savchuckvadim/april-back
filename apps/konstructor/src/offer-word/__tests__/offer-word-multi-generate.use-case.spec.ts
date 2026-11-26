import { Test } from '@nestjs/testing';
import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { PBXService } from '@lib/pbx';
import { noteBitrixCallMethod } from '@lib/bitrix/core/base/bitrix-error-method.util';
import { InnerDealService } from '@app/konstructor/modules/inner-deal/services/inner-deal.service';
import { OfferTemplateService } from '@app/konstructor/modules/offer-template/offer-template';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import {
    captionRow,
    supplyDto,
} from '@app/konstructor/document-generate/supply/__tests__/supply-caption.fixtures';
import { IPreparedDocument } from '../interface/document.interface';
import {
    BitrixDocumentSaveFlowService,
    IDocumentSaveFlowData,
    IDocumentSaveFlowResult,
} from '../services/bitrix/bitrix-document-save-flow.service';
import {
    ITimeLineErrorData,
    OfferBxTimelineService,
} from '../services/bitrix/offer-bx-timeline.service';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';
import {
    IOfferWordMultiBuildResult,
    OfferWordMultiBuildService,
} from '../multi/services/offer-word-multi-build.service';
import { OfferWordMultiSupplyEnrichService } from '../multi/services/offer-word-multi-supply-enrich.service';
import { OfferWordMultiGenerateUseCase } from '../multi/use-cases/offer-word-multi-generate.use-case';

/**
 * Ручка generate-multi дополняет подписи поставок до сборки документов:
 * сборка получает запрос с уже дополненными подписями.
 */
const document: IPreparedDocument = {
    link: 'https://pdf/offer.pdf',
    name: 'КП',
    type: 'offer',
    absolutePath: '/tmp/offer.pdf',
};

const buildResult: IOfferWordMultiBuildResult = {
    template: new WordTemplate({}),
    renderData: {},
    offer: document,
    offers: [document],
    invoices: [],
    warnings: [],
    mode: 'single',
};

const saveResult: IDocumentSaveFlowResult = {
    portalFolderId: 5,
    documents: [{ link: document.link, name: document.name, type: 'offer' }],
    files: [],
};

const requestOf = (): OfferWordMultiGenerateDto =>
    Object.assign(new OfferWordMultiGenerateDto(), {
        templateId: '1',
        domain: 'test.bitrix24.ru',
        companyId: '3',
        dealId: '4',
        userId: 6,
        variants: [],
    });

const setup = async () => {
    const received = requestOf();
    const enriched = Object.assign(new OfferWordMultiGenerateDto(), {
        ...received,
        total: captionRow('Итого', supplyDto('internet_5', 5)),
    });

    const enrich = jest.fn<
        Promise<OfferWordMultiGenerateDto>,
        [OfferWordMultiGenerateDto]
    >(dto => Promise.resolve(dto === received ? enriched : dto));
    const build = jest
        .fn<Promise<IOfferWordMultiBuildResult>, [OfferWordMultiGenerateDto]>()
        .mockResolvedValue(buildResult);
    const sendErrorToBitrix = jest.fn<Promise<void>, [ITimeLineErrorData]>(() =>
        Promise.resolve(),
    );
    const sendDocumentToBitrix = jest.fn(() => Promise.resolve());
    const saveDocuments = jest.fn<
        Promise<IDocumentSaveFlowResult>,
        [IDocumentSaveFlowData]
    >(() => Promise.resolve(saveResult));
    const incrementTemplateCounter = jest.fn(() => Promise.resolve());

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferWordMultiGenerateUseCase,
            { provide: PBXService, useValue: {} },
            { provide: OfferWordMultiBuildService, useValue: { build } },
            {
                provide: OfferWordMultiSupplyEnrichService,
                useValue: { enrich },
            },
            {
                provide: InnerDealService,
                useValue: {
                    setOfferTemplateByDomainAndDealId: jest.fn(() =>
                        Promise.resolve(),
                    ),
                },
            },
            {
                provide: OfferBxTimelineService,
                useValue: {
                    sendDocumentToBitrix,
                    sendErrorToBitrix,
                },
            },
            {
                provide: BitrixDocumentSaveFlowService,
                useValue: { saveDocuments },
            },
            {
                provide: OfferWordCoreGenerateService,
                useValue: {
                    removeSavedDocx: jest.fn(() => Promise.resolve()),
                },
            },
            {
                provide: OfferTemplateService,
                useValue: { incrementTemplateCounter },
            },
        ],
    }).compile();

    return {
        useCase: moduleRef.get(OfferWordMultiGenerateUseCase),
        received,
        enriched,
        enrich,
        build,
        sendErrorToBitrix,
        sendDocumentToBitrix,
        saveDocuments,
        incrementTemplateCounter,
    };
};

/** Ошибка вызова Битрикса так, как её бросает BitrixCore: axios + метка метода. */
const bitrixError = (method: string, status: number, body: unknown) => {
    const error = new AxiosError(
        `Request failed with status code ${status}`,
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
            status,
            statusText: '',
            headers: {},
            config: {} as InternalAxiosRequestConfig,
            data: body,
        },
    );
    noteBitrixCallMethod(error, method);
    return error;
};

const lastReason = (
    sendErrorToBitrix: jest.Mock<Promise<void>, [ITimeLineErrorData]>,
): string => sendErrorToBitrix.mock.calls[0][0].reason;

describe('OfferWordMultiGenerateUseCase: подписи поставок', () => {
    it('сборка получает запрос после дополнения подписей', async () => {
        const { useCase, received, enriched, enrich, build } = await setup();

        const result = await useCase.execute(received);

        expect(enrich).toHaveBeenCalledTimes(1);
        expect(enrich).toHaveBeenCalledWith(received);
        expect(build).toHaveBeenCalledTimes(1);
        expect(build.mock.calls[0][0]).toBe(enriched);
        expect(result.link.link).toBe(document.link);
    });

    it('сбой дополнения сообщает в таймлайн и не доходит до сборки', async () => {
        const { useCase, received, enrich, build, sendErrorToBitrix } =
            await setup();
        enrich.mockRejectedValueOnce(new Error('справочник недоступен'));

        await expect(useCase.execute(received)).rejects.toThrow(
            'справочник недоступен',
        );

        expect(build).not.toHaveBeenCalled();
        expect(sendErrorToBitrix).toHaveBeenCalledTimes(1);
    });
});

/**
 * gsirk 26.11.2026, сделка 281275: Диск Битрикса отказал в сохранении файла, а
 * в сделку ушло безликое «Ошибка при создании документа». Теперь в комментарии
 * шаг и текст Битрикса.
 */
describe('OfferWordMultiGenerateUseCase: причина сбоя в сделке', () => {
    it('отказ Диска: комментарий называет шаг, код Битрикса и советует повторить', async () => {
        const { useCase, received, saveDocuments, sendErrorToBitrix } =
            await setup();
        const failure = bitrixError('disk.folder.uploadfile', 400, {
            error: 'DISK_FOLDER_22002',
            error_description:
                'Не удалось сохранить файл. (DISK_FOLDER_22002).',
        });
        saveDocuments.mockRejectedValueOnce(failure);

        await expect(useCase.execute(received)).rejects.toBe(failure);

        expect(sendErrorToBitrix).toHaveBeenCalledTimes(1);
        expect(sendErrorToBitrix).toHaveBeenCalledWith({
            domain: 'test.bitrix24.ru',
            companyId: '3',
            userId: 6,
            dealId: '4',
            reason: 'КП не сформировано: загрузка на Диск — Битрикс ответил «Не удалось сохранить файл» (DISK_FOLDER_22002). Повторите формирование.',
        });
    });

    it('сбой сборки: внутренняя ошибка без текста исключения', async () => {
        const { useCase, received, build, sendErrorToBitrix } = await setup();
        build.mockRejectedValueOnce(
            new Error("ENOENT: open '/srv/result/test/offer.docx'"),
        );

        await expect(useCase.execute(received)).rejects.toThrow('ENOENT');

        const reason = lastReason(sendErrorToBitrix);
        expect(reason).toBe(
            'КП не сформировано: сборка документа — внутренняя ошибка, подробности в журнале.',
        );
        expect(reason).not.toContain('/srv/');
    });

    it('сбой записи в таймлайн: шаг «запись в таймлайн сделки»', async () => {
        const { useCase, received, sendDocumentToBitrix, sendErrorToBitrix } =
            await setup();
        sendDocumentToBitrix.mockRejectedValueOnce(
            bitrixError('crm.timeline.comment.add', 403, {
                error: 'ACCESS_DENIED',
                error_description: 'Access denied',
            }),
        );

        await expect(useCase.execute(received)).rejects.toBeDefined();

        expect(lastReason(sendErrorToBitrix)).toBe(
            'КП не сформировано: запись в таймлайн сделки — Битрикс ответил «Access denied» (ACCESS_DENIED).',
        );
    });

    it('сбой после записи в сделку: КП уже у менеджера, текст об этом', async () => {
        const {
            useCase,
            received,
            incrementTemplateCounter,
            sendErrorToBitrix,
        } = await setup();
        incrementTemplateCounter.mockRejectedValueOnce(new Error('db down'));

        await expect(useCase.execute(received)).rejects.toThrow('db down');

        expect(lastReason(sendErrorToBitrix)).toBe(
            'КП сформировано и лежит в сделке, но завершающий шаг не выполнился: внутренняя ошибка, подробности в журнале.',
        );
    });

    it('комментарий не записался — наверх всё равно уходит исходная ошибка КП', async () => {
        const { useCase, received, saveDocuments, sendErrorToBitrix } =
            await setup();
        const failure = new Error('Диск недоступен');
        saveDocuments.mockRejectedValueOnce(failure);
        sendErrorToBitrix.mockRejectedValueOnce(new Error('портал недоступен'));

        await expect(useCase.execute(received)).rejects.toBe(failure);
    });

    it('успех: комментария об ошибке нет', async () => {
        const { useCase, received, sendErrorToBitrix } = await setup();

        await useCase.execute(received);

        expect(sendErrorToBitrix).not.toHaveBeenCalled();
    });
});
