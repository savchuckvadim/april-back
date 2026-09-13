import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealService } from '../services/inner-deal.service';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import { InnerDealUpsertDto } from '../dto/inner-deal.dto';

/**
 * Вариантов комплекта на сделке несколько, и различает их колонка `smartId`
 * (элемент смарта «Варианты комплекта»). Обычный слепок сделки и слепок
 * «предложения на будущий период» — не варианты.
 */
describe('InnerDealService: варианты комплекта', () => {
    const makeMocks = () => ({
        findSnapshot: jest.fn().mockResolvedValue(null),
        findVariantSnapshot: jest.fn().mockResolvedValue(null),
        listVariantsByDealId: jest.fn().mockResolvedValue([]),
        findByDomainAndDealId: jest.fn().mockResolvedValue(null),
        findByServiceSmartId: jest.fn().mockResolvedValue(null),
        findPortalIdByDomain: jest.fn().mockResolvedValue(5n),
        create: jest
            .fn()
            .mockImplementation(
                (data: Partial<BxDocumentDeal>): Partial<BxDocumentDeal> =>
                    data,
            ),
        update: jest
            .fn()
            .mockImplementation(
                (
                    _id: bigint,
                    data: Partial<BxDocumentDeal>,
                ): Partial<BxDocumentDeal> => data,
            ),
    });

    const makeService = (mocks: ReturnType<typeof makeMocks>) =>
        new InnerDealService(mocks as unknown as InnerDealRepository);

    const upsertDto = (over: Partial<InnerDealUpsertDto> = {}) =>
        ({
            domain: 'gsr.bitrix24.ru',
            dealId: 159701,
            currentComplect: '{"type":"prof"}',
            ...over,
        }) as InnerDealUpsertDto;

    it('с variantSmartId слепок пишется как вариант', async () => {
        const mocks = makeMocks();

        await makeService(mocks).upsertSnapshot(
            upsertDto({ variantSmartId: 5001 }),
        );

        const [data] = mocks.create.mock.calls[0] as [Partial<BxDocumentDeal>];
        expect(data.smartId).toBe(5001);
        expect(data.serviceSmartId).toBeNull();
    });

    it('без variantSmartId это обычный слепок сделки', async () => {
        const mocks = makeMocks();

        await makeService(mocks).upsertSnapshot(upsertDto());

        const [data] = mocks.create.mock.calls[0] as [Partial<BxDocumentDeal>];
        expect(data.smartId).toBeNull();
    });

    it('повторное сохранение варианта обновляет его строку, а не плодит новую', async () => {
        const mocks = makeMocks();
        mocks.findVariantSnapshot.mockResolvedValue({
            id: 42n,
        } as BxDocumentDeal);

        await makeService(mocks).upsertSnapshot(
            upsertDto({ variantSmartId: 5001 }),
        );

        expect(mocks.create).not.toHaveBeenCalled();
        const [id] = mocks.update.mock.calls[0] as [bigint];
        expect(id).toBe(42n);
        // ключ варианта — smartId, а не serviceSmartId
        expect(mocks.findVariantSnapshot).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            159701,
            5001,
        );
        expect(mocks.findSnapshot).not.toHaveBeenCalled();
    });

    it('слепок сделки и вариант не мешают друг другу', async () => {
        const mocks = makeMocks();
        // у сделки уже есть обычный слепок…
        mocks.findSnapshot.mockResolvedValue({ id: 10n } as BxDocumentDeal);

        // …но вариант ищется своим ключом и не находит его
        await makeService(mocks).upsertSnapshot(
            upsertDto({ variantSmartId: 5001 }),
        );

        expect(mocks.create).toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('список вариантов идёт мимо обычных слепков', async () => {
        const mocks = makeMocks();
        mocks.listVariantsByDealId.mockResolvedValue([
            { id: 1n, smartId: 5001 },
            { id: 2n, smartId: 5002 },
        ] as BxDocumentDeal[]);

        const variants = await makeService(mocks).listVariants(
            'gsr.bitrix24.ru',
            159701,
        );

        expect(variants).toHaveLength(2);
        expect(mocks.listVariantsByDealId).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            159701,
        );
    });
});
