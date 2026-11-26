import { Test } from '@nestjs/testing';
import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { noteBitrixCallMethod } from '@lib/bitrix/core/base/bitrix-error-method.util';
import { InnerDealService } from '@app/konstructor/modules/inner-deal/services/inner-deal.service';
import { OfferTemplateService } from '@app/konstructor/modules/offer-template/offer-template';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
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
import {
    DocumentBuildService,
    IDocumentBuildResult,
} from '../services/document-build.service';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { OfferWordByTemplateGenerateUseCase } from '../use-cases/offer-word-by-template-generate.use-case';

/**
 * Легаси-путь генерации КП (его зовёт старый фронт через очередь): при сбое
 * в сделку уходит причина вместо безликого «Ошибка при создании документа».
 */
const document: IPreparedDocument = {
    link: 'https://pdf/offer.pdf',
    name: 'КП',
    type: 'offer',
    absolutePath: '/tmp/offer.pdf',
};

const buildResult: IDocumentBuildResult = {
    template: new WordTemplate({}),
    renderData: {},
    offer: document,
    invoices: [],
};

const saveResult: IDocumentSaveFlowResult = {
    portalFolderId: 5,
    documents: [{ link: document.link, name: document.name, type: 'offer' }],
    files: [],
};

const requestOf = (): OfferWordByTemplateGenerateDto =>
    Object.assign(new OfferWordByTemplateGenerateDto(), {
        templateId: '1',
        domain: 'gsirk.bitrix24.ru',
        companyId: '3',
        dealId: '281275',
        userId: 6,
    });

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

const setup = async () => {
    const input = requestOf();
    const enrichPayload = jest.fn<
        Promise<OfferWordByTemplateGenerateDto>,
        [OfferWordByTemplateGenerateDto]
    >(dto => Promise.resolve(dto));
    const build = jest
        .fn<Promise<IDocumentBuildResult>, [OfferWordByTemplateGenerateDto]>()
        .mockResolvedValue(buildResult);
    const saveDocuments = jest.fn<
        Promise<IDocumentSaveFlowResult>,
        [IDocumentSaveFlowData]
    >(() => Promise.resolve(saveResult));
    const sendDocumentToBitrix = jest.fn(() => Promise.resolve());
    const sendErrorToBitrix = jest.fn<Promise<void>, [ITimeLineErrorData]>(() =>
        Promise.resolve(),
    );
    const incrementTemplateCounter = jest.fn(() => Promise.resolve());

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferWordByTemplateGenerateUseCase,
            { provide: DocumentBuildService, useValue: { build } },
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
                useValue: { sendDocumentToBitrix, sendErrorToBitrix },
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
            {
                provide: SupplyPayloadEnricherService,
                useValue: { enrichPayload },
            },
        ],
    }).compile();

    return {
        useCase: moduleRef.get(OfferWordByTemplateGenerateUseCase),
        input,
        enrichPayload,
        build,
        saveDocuments,
        sendDocumentToBitrix,
        sendErrorToBitrix,
        incrementTemplateCounter,
    };
};

describe('OfferWordByTemplateGenerateUseCase: причина сбоя в сделке', () => {
    it('отказ Диска (случай gsirk 26.11.2026): шаг, текст Битрикса и код в комментарии', async () => {
        const { useCase, input, saveDocuments, sendErrorToBitrix } =
            await setup();
        const failure = bitrixError('disk.folder.uploadfile', 400, {
            error: 'DISK_FOLDER_22002',
            error_description:
                'Не удалось сохранить файл. (DISK_FOLDER_22002).',
        });
        saveDocuments.mockRejectedValueOnce(failure);

        await expect(useCase.execute(input)).rejects.toBe(failure);

        expect(sendErrorToBitrix).toHaveBeenCalledTimes(1);
        expect(sendErrorToBitrix).toHaveBeenCalledWith({
            domain: 'gsirk.bitrix24.ru',
            companyId: '3',
            userId: 6,
            dealId: '281275',
            reason: 'КП не сформировано: загрузка на Диск — Битрикс ответил «Не удалось сохранить файл» (DISK_FOLDER_22002). Повторите формирование.',
        });
    });

    it('сбой сборки документа: внутренняя ошибка, текст исключения не раскрывается', async () => {
        const { useCase, input, build, sendErrorToBitrix } = await setup();
        build.mockRejectedValueOnce(
            new Error("Cannot read 'rows' of undefined"),
        );

        await expect(useCase.execute(input)).rejects.toThrow('rows');

        expect(sendErrorToBitrix.mock.calls[0][0].reason).toBe(
            'КП не сформировано: сборка документа — внутренняя ошибка, подробности в журнале.',
        );
    });

    it('сбой подписей поставок тоже сообщается в сделку и не доходит до сборки', async () => {
        const { useCase, input, enrichPayload, build, sendErrorToBitrix } =
            await setup();
        enrichPayload.mockRejectedValueOnce(new Error('справочник недоступен'));

        await expect(useCase.execute(input)).rejects.toThrow(
            'справочник недоступен',
        );

        expect(build).not.toHaveBeenCalled();
        expect(sendErrorToBitrix).toHaveBeenCalledWith(
            expect.objectContaining({
                dealId: '281275',
                reason: 'КП не сформировано: сборка документа — внутренняя ошибка, подробности в журнале.',
            }),
        );
    });

    it('сбой записи в таймлайн: шаг и ответ Битрикса', async () => {
        const { useCase, input, sendDocumentToBitrix, sendErrorToBitrix } =
            await setup();
        sendDocumentToBitrix.mockRejectedValueOnce(
            bitrixError('crm.timeline.comment.add', 503, {
                error: 'QUERY_LIMIT_EXCEEDED',
                error_description: 'Too many requests',
            }),
        );

        await expect(useCase.execute(input)).rejects.toBeDefined();

        expect(sendErrorToBitrix.mock.calls[0][0].reason).toBe(
            'КП не сформировано: запись в таймлайн сделки — Битрикс ответил «Too many requests» (QUERY_LIMIT_EXCEEDED). Повторите формирование.',
        );
    });

    it('сбой после записи в сделку: КП уже у менеджера, текст об этом', async () => {
        const { useCase, input, incrementTemplateCounter, sendErrorToBitrix } =
            await setup();
        incrementTemplateCounter.mockRejectedValueOnce(new Error('db down'));

        await expect(useCase.execute(input)).rejects.toThrow('db down');

        expect(sendErrorToBitrix.mock.calls[0][0].reason).toBe(
            'КП сформировано и лежит в сделке, но завершающий шаг не выполнился: внутренняя ошибка, подробности в журнале.',
        );
    });

    it('комментарий не записался — наверх уходит исходная ошибка КП', async () => {
        const { useCase, input, saveDocuments, sendErrorToBitrix } =
            await setup();
        const failure = new Error('Диск недоступен');
        saveDocuments.mockRejectedValueOnce(failure);
        sendErrorToBitrix.mockRejectedValueOnce(new Error('портал недоступен'));

        await expect(useCase.execute(input)).rejects.toBe(failure);
    });

    it('успех: результат отдан, комментария об ошибке нет', async () => {
        const { useCase, input, sendErrorToBitrix } = await setup();

        const result = await useCase.execute(input);

        expect(result.link.link).toBe(document.link);
        expect(result.portalFolderId).toBe(5);
        expect(sendErrorToBitrix).not.toHaveBeenCalled();
    });
});
