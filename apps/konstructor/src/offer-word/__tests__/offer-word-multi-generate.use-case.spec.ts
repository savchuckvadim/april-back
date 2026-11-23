import { Test } from '@nestjs/testing';
import { PBXService } from '@lib/pbx';
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
    const sendErrorToBitrix = jest.fn(() => Promise.resolve());

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
                    sendDocumentToBitrix: jest.fn(() => Promise.resolve()),
                    sendErrorToBitrix,
                },
            },
            {
                provide: BitrixDocumentSaveFlowService,
                useValue: {
                    saveDocuments: jest.fn(() => Promise.resolve(saveResult)),
                },
            },
            {
                provide: OfferWordCoreGenerateService,
                useValue: {
                    removeSavedDocx: jest.fn(() => Promise.resolve()),
                },
            },
            {
                provide: OfferTemplateService,
                useValue: {
                    incrementTemplateCounter: jest.fn(() => Promise.resolve()),
                },
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
    };
};

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
