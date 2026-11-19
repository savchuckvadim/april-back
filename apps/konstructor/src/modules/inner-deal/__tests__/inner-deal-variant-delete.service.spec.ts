import { BadRequestException } from '@nestjs/common';
import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import { InnerDealService } from '../services/inner-deal.service';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '../type/complect-composition.type';

/**
 * Удаление варианта комплекта: уходят строки варианта этой сделки, строка самой
 * сделки остаётся, а ссылка на «открытый вариант» в настройках сделки снимается,
 * если она вела на удалённый вариант.
 */
describe('InnerDealService.deleteVariant', () => {
    const DOMAIN = 'gsr.bitrix24.ru';
    const DEAL_ID = 159701;

    const settingsJson = (openVariantSmartId: number | null): string =>
        JSON.stringify({
            mode: ComplectModeEnum.MULTI_CONTRACT,
            offer: {
                infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                showAlternatives: true,
                separateDocuments: true,
            },
            openVariantSmartId,
        });

    const makeMocks = (
        over: {
            removed?: number;
            dealRow?: Partial<BxDocumentDeal> | null;
        } = {},
    ) => ({
        deleteVariantSnapshots: jest.fn().mockResolvedValue(over.removed ?? 1),
        findSnapshot: jest.fn().mockResolvedValue(over.dealRow ?? null),
        update: jest
            .fn()
            .mockImplementation((id: bigint, data: Partial<BxDocumentDeal>) =>
                Promise.resolve({ id, ...data }),
            ),
    });

    const makeService = (mocks: ReturnType<typeof makeMocks>) =>
        new InnerDealService(mocks as unknown as InnerDealRepository);

    it('удаляет строки варианта своей сделки и возвращает true', async () => {
        const mocks = makeMocks({ removed: 1 });

        const deleted = await makeService(mocks).deleteVariant(
            DOMAIN,
            DEAL_ID,
            5001,
        );

        expect(deleted).toBe(true);
        expect(mocks.deleteVariantSnapshots).toHaveBeenCalledWith(
            DOMAIN,
            DEAL_ID,
            5001,
        );
    });

    it('строки уже не было — deleted:false, без ошибки', async () => {
        const mocks = makeMocks({ removed: 0 });

        const deleted = await makeService(mocks).deleteVariant(
            DOMAIN,
            DEAL_ID,
            5001,
        );

        expect(deleted).toBe(false);
    });

    it.each([0, -1, 1.5, Number.NaN])(
        'variantSmartId=%p отклоняется 400 до обращения к базе',
        async variantSmartId => {
            const mocks = makeMocks();
            const service = makeService(mocks);

            await expect(
                service.deleteVariant(DOMAIN, DEAL_ID, variantSmartId),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(mocks.deleteVariantSnapshots).not.toHaveBeenCalled();
            expect(mocks.update).not.toHaveBeenCalled();
        },
    );

    it('пустой variantSmartId (undefined) отклоняется 400', async () => {
        const mocks = makeMocks();

        await expect(
            makeService(mocks).deleteVariant(
                DOMAIN,
                DEAL_ID,
                undefined as unknown as number,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mocks.deleteVariantSnapshots).not.toHaveBeenCalled();
    });

    it('настройки указывали на удалённый вариант — ссылка очищается, остальное не меняется', async () => {
        const mocks = makeMocks({
            dealRow: { id: 77n, settings: settingsJson(5001) },
        });

        await makeService(mocks).deleteVariant(DOMAIN, DEAL_ID, 5001);

        // ищем строку самой сделки: serviceSmartId = null
        expect(mocks.findSnapshot).toHaveBeenCalledWith(DOMAIN, DEAL_ID, null);
        const [id, data] = mocks.update.mock.calls[0] as [
            bigint,
            Partial<BxDocumentDeal>,
        ];
        expect(id).toBe(77n);
        expect(Object.keys(data)).toEqual(['settings']);
        expect(JSON.parse(data.settings as string)).toEqual({
            mode: ComplectModeEnum.MULTI_CONTRACT,
            offer: {
                infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                showAlternatives: true,
                separateDocuments: true,
            },
            openVariantSmartId: null,
        });
    });

    it('открыт другой вариант — настройки не трогаем', async () => {
        const mocks = makeMocks({
            dealRow: { id: 77n, settings: settingsJson(5002) },
        });

        await makeService(mocks).deleteVariant(DOMAIN, DEAL_ID, 5001);

        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('настроек у сделки нет — ничего не пишем', async () => {
        const mocks = makeMocks({ dealRow: { id: 77n, settings: null } });

        await makeService(mocks).deleteVariant(DOMAIN, DEAL_ID, 5001);

        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('строки сделки нет — ничего не пишем и не создаём', async () => {
        const mocks = makeMocks({ dealRow: null });

        await expect(
            makeService(mocks).deleteVariant(DOMAIN, DEAL_ID, 5001),
        ).resolves.toBe(true);

        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('битые настройки не роняют удаление', async () => {
        const mocks = makeMocks({
            dealRow: { id: 77n, settings: '{не json' },
        });

        await expect(
            makeService(mocks).deleteVariant(DOMAIN, DEAL_ID, 5001),
        ).resolves.toBe(true);

        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('ссылка снимается и тогда, когда строки варианта в базе уже не было', async () => {
        const mocks = makeMocks({
            removed: 0,
            dealRow: { id: 77n, settings: settingsJson(5001) },
        });

        const deleted = await makeService(mocks).deleteVariant(
            DOMAIN,
            DEAL_ID,
            5001,
        );

        expect(deleted).toBe(false);
        expect(mocks.update).toHaveBeenCalledTimes(1);
    });
});
