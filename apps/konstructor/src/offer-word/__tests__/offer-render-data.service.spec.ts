import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ContractDto } from '@app/konstructor/dto/contract.dto';
import {
    createComplectSectionFixture,
    createOfferRenderDataFixture,
} from '../lib/sample-offer-render-data';
import {
    OfferWordByTemplateGenerateDto,
    ProductRowFullSetsDto,
} from '../dto/offer-word-generate-request.dto';
import { OfferRenderDataService } from '../services/render-data-services/offer-render-data.service';
import {
    IComplectSectionsRenderData,
    IInfoblocksRenderData,
} from '../services/render-data-services/offer-render-infoblocks.service';

/**
 * Итоговые данные КП для Word и PDF собираются из данных сервисов: поля
 * наполнения по комплектам доходят до шаблона вместе с верхними полями.
 */
const sample = createOfferRenderDataFixture();
const infoblocksOf = (
    extra: IComplectSectionsRenderData,
): IInfoblocksRenderData & IComplectSectionsRenderData => ({
    infoblocksByGroups: sample.infoblocksByGroups,
    simpleInfoblocks: sample.simpleInfoblocks,
    simpleInfoblocksByColumns: sample.simpleInfoblocksByColumns,
    NPA: sample.NPA,
    Comments: sample.Comments,
    CaseLaw: sample.CaseLaw,
    Free: [],
    Special: sample.Special,
    STAR: [],
    Academy: sample.Academy,
    Consalting: sample.Consalting,
    PacketsEr: [],
    Ers: [],
    FreeBlocks: [],
    LegalTech: [],
    ...extra,
});

const createService = (
    infoblocks: IInfoblocksRenderData & IComplectSectionsRenderData,
) => {
    const infoblocksService = {
        renderInfoblocks: jest.fn().mockResolvedValue(infoblocks),
    };
    const service = new OfferRenderDataService(
        { findById: jest.fn().mockResolvedValue(null) } as never,
        infoblocksService as never,
        {
            renderProductPrices: jest.fn().mockReturnValue({ ProductRows: [] }),
            renderTotalPrice: jest.fn().mockReturnValue({ TotalRow: [] }),
        } as never,
        { renderTotalPrice: jest.fn().mockReturnValue({}) } as never,
        { renderProviderRq: jest.fn().mockReturnValue({}) } as never,
        { getData: jest.fn().mockReturnValue({}) } as never,
        { getData: jest.fn().mockReturnValue({}) } as never,
    );
    return { service, infoblocksService };
};

/** Запрос с полями, которые читает сборка данных */
const createRequest = (): OfferWordByTemplateGenerateDto =>
    Object.assign(new OfferWordByTemplateGenerateDto(), {
        providerId: 5,
        contractType: CONTRACT_LTYPE.LIC,
        complect: [],
        rows: [],
        sets: Object.assign(new ProductRowFullSetsDto(), {
            general: [],
            alternative: [],
        }),
        contract: Object.assign(new ContractDto(), {
            aprilName: 'Информационное обслуживание',
            prepayment: 1,
        }),
        total: Object.assign(new ProductRowDto(), { name: 'Итого' }),
    });

describe('OfferRenderDataService: наполнение по комплектам в данных шаблона', () => {
    it('ComplectSections и IsComplectsSeparate доходят до данных рядом с верхними полями наполнения', async () => {
        const sections = [
            createComplectSectionFixture('Бухгалтерия', 'Интернет 3 ОД', []),
            createComplectSectionFixture('Юрист', '', []),
        ];
        const { service } = createService(
            infoblocksOf({
                ComplectSections: sections,
                IsComplectsSeparate: true,
            }),
        );

        const data = await service.getOfferRenderData(createRequest());

        expect(data.ComplectSections).toBe(sections);
        expect(data.IsComplectsSeparate).toBe(true);
        expect(data.infoblocksByGroups).toBe(sample.infoblocksByGroups);
        expect(data.NPA).toBe(sample.NPA);
    });

    it('запрос без complects: в данных нет ни ComplectSections, ни флага', async () => {
        const { service } = createService(infoblocksOf({}));

        const data = await service.getOfferRenderData(createRequest());

        expect(data).not.toHaveProperty('ComplectSections');
        expect(data).not.toHaveProperty('IsComplectsSeparate');
        expect(data.infoblocksByGroups).toBe(sample.infoblocksByGroups);
    });
});
