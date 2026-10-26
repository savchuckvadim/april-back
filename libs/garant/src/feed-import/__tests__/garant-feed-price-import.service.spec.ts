import { GarantFeedPriceImportService } from '../services/garant-feed-price-import.service';
import { FeedProfPriceRow, FeedStarRow } from '../types/garant-feed.types';

const profRow = (
    overrides: Partial<FeedProfPriceRow> = {},
): FeedProfPriceRow => ({
    number: 0,
    complectName: 'Бухгалтер',
    complectNumber: 0,
    supplyNumber: 1,
    price: 8187,
    region: 0,
    complectType: 0,
    ...overrides,
});

const starRow = (): FeedStarRow => ({
    number: 0,
    name: 'СТАР',
    fullName: 'Система торговых аналитических решений',
    msk: 4600,
    regions: 3800,
    description: '',
    type: 'star',
    weight: 10,
});

interface MockSetup {
    complectCodes?: string[];
    packageCodes?: string[];
    existingPrice?: boolean;
}

const makeService = ({
    complectCodes = ['buh'],
    packageCodes = [],
    existingPrice = false,
}: MockSetup = {}) => {
    const priceService = {
        storeByComplect: jest.fn().mockResolvedValue({}),
        storeByPackage: jest.fn().mockResolvedValue({}),
        findByUnique: jest
            .fn()
            .mockResolvedValue(existingPrice ? { id: 1n } : null),
        findPackagePrice: jest
            .fn()
            .mockResolvedValue(existingPrice ? { id: 1n } : null),
    };
    const complectService = {
        findAll: jest
            .fn()
            .mockResolvedValue(complectCodes.map(code => ({ code }))),
    };
    const packageService = {
        findByCode: jest
            .fn()
            .mockImplementation((code: string) =>
                Promise.resolve(packageCodes.includes(code) ? { code } : null),
            ),
    };
    const service = new GarantFeedPriceImportService(
        priceService as never,
        complectService as never,
        packageService as never,
    );
    return { service, priceService };
};

describe('GarantFeedPriceImportService — prof', () => {
    it('превращает номера фида в коды каталога (код поставки — internet_<ОД>)', async () => {
        const { service, priceService } = makeService();
        const report = await service.importProf([profRow()], false);

        expect(report.created).toBe(1);
        expect(priceService.storeByComplect).toHaveBeenCalledWith(
            expect.objectContaining({
                complectCode: 'buh',
                supplyCode: 'internet_1',
                supplyType: 'internet',
                region_type: '0',
                value: 8187,
            }),
        );
    });

    it('номер поставки 9 — проксима «Локальная» (не интернет)', async () => {
        const { service, priceService } = makeService();
        await service.importProf([profRow({ supplyNumber: 9 })], false);

        expect(priceService.storeByComplect).toHaveBeenCalledWith(
            expect.objectContaining({
                supplyCode: 'proxima_local',
                supplyType: 'proxima',
            }),
        );
    });

    it('повторный импорт считается обновлением', async () => {
        const { service } = makeService({ existingPrice: true });
        const report = await service.importProf([profRow()], false);

        expect(report.updated).toBe(1);
        expect(report.created).toBe(0);
    });

    it('скипает строки: нет комплекта в БД, universal-регион, нулевая цена', async () => {
        const { service, priceService } = makeService({
            complectCodes: ['buh'],
        });
        const report = await service.importProf(
            [
                profRow({ complectNumber: 2 }), // ur не в БД
                profRow({ region: 'ud' }), // universal-строка
                profRow({ price: 0 }),
                profRow({ complectNumber: 999 }), // вне карты
            ],
            false,
        );

        expect(report.skipped).toHaveLength(4);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
    });

    it('dryRun не пишет, но считает', async () => {
        const { service, priceService } = makeService();
        const report = await service.importProf([profRow()], true);

        expect(report.created).toBe(1);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
    });
});

describe('GarantFeedPriceImportService — услуги', () => {
    it('LT-строка пишется ценой пакета по его коду', async () => {
        const { service, priceService } = makeService({
            packageCodes: ['ltpackSmall'],
        });
        const report = await service.importServices(
            [
                profRow({
                    complectNumber: 13,
                    supplyNumber: false,
                    price: 1800,
                    region: 0,
                }),
            ],
            [],
            false,
        );

        expect(report.created).toBe(1);
        expect(priceService.storeByPackage).toHaveBeenCalledWith(
            expect.objectContaining({
                garantPackageCode: 'ltpackSmall',
                region_type: '0',
                value: 1800,
            }),
        );
    });

    it('устаревший LT-номер и отсутствующий пакет попадают в skipped', async () => {
        const { service } = makeService({ packageCodes: [] });
        const report = await service.importServices(
            [
                profRow({ complectNumber: 1020, supplyNumber: false }),
                profRow({
                    complectNumber: 13,
                    supplyNumber: false,
                    price: 1800,
                }),
            ],
            [],
            false,
        );

        expect(report.skipped).toHaveLength(2);
        expect(report.skipped[1].reason).toContain('не найден в БД');
    });

    it('СТАР даёт две цены: Москва и регионы', async () => {
        const { service, priceService } = makeService({
            packageCodes: ['starpack'],
        });
        const report = await service.importServices([], [starRow()], false);

        expect(report.created).toBe(2);
        expect(priceService.storeByPackage).toHaveBeenCalledWith(
            expect.objectContaining({ region_type: '1', value: 4600 }),
        );
        expect(priceService.storeByPackage).toHaveBeenCalledWith(
            expect.objectContaining({ region_type: '0', value: 3800 }),
        );
    });
});
