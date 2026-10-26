import { GarantFeedSeedService } from '../services/garant-feed-seed.service';
import { GarantFeed } from '../types/garant-feed.types';

const feed = (): GarantFeed => ({
    prices: {
        prof: [],
        universal: [
            {
                number: 0,
                complectName: 'Классик',
                complectNumber: 9,
                supplyNumber: false,
                price: 835440,
                region: 'ud',
                complectType: false,
            },
        ],
        lt: [
            {
                number: 13,
                complectName: 'ГАРАНТ-LegalTech. Малый пакет',
                complectNumber: 13,
                supplyNumber: false,
                price: 1800,
                region: 0,
                complectType: false,
            },
        ],
        star: [
            {
                number: 0,
                name: 'СТАР',
                fullName: 'Система торговых аналитических решений',
                msk: 4600,
                regions: 3800,
                description: '',
                type: 'star',
                weight: 10,
            },
        ],
    },
    regions: [
        {
            number: 0,
            title: 'Алтайский край',
            abs: 4177.2,
            name: 'ud',
            infoblock: 'Законодательство Алтайского края',
        },
    ],
    consalting: [
        { id: 1, name: 'Советы экспертов', title: 'СЭ. Полное', rabs: 1 },
        { id: 2, name: 'Правовой консалтинг', title: 'ПК. Премиум', rabs: 3 },
    ],
});

const makeService = (existingCodes: string[] = []) => {
    const has = (code: string) => existingCodes.includes(code);
    const supplyService = {
        findByCode: jest
            .fn()
            .mockImplementation((code: string) =>
                Promise.resolve(has(code) ? { code } : null),
            ),
        create: jest
            .fn()
            .mockImplementation((supply: { code: string }) =>
                Promise.resolve(supply),
            ),
    };
    const complectService = {
        findByCode: jest
            .fn()
            .mockImplementation((code: string) =>
                Promise.resolve(has(code) ? { code } : null),
            ),
        create: jest
            .fn()
            .mockImplementation((dto: { code: string }) =>
                Promise.resolve(dto),
            ),
    };
    const packageService = {
        findByCode: jest
            .fn()
            .mockImplementation((code: string) =>
                Promise.resolve(has(code) ? { code } : null),
            ),
        create: jest
            .fn()
            .mockImplementation((dto: { code: string }) =>
                Promise.resolve(dto),
            ),
    };
    const service = new GarantFeedSeedService(
        supplyService as never,
        complectService as never,
        packageService as never,
    );
    return { service, supplyService, complectService, packageService };
};

describe('GarantFeedSeedService', () => {
    it('сидирует все 19 поставок легаси-сетки с кодами internet_*/proxima_*', async () => {
        const { service, supplyService } = makeService();
        const report = await service.seedSupplies(false);

        expect(report.created).toBe(19);
        const codes = supplyService.create.mock.calls.map(
            ([supply]: [{ code: string }]) => supply.code,
        );
        expect(codes).toContain('internet_std');
        expect(codes).toContain('proxima_flash');
        expect(codes).toContain('internet_50');
    });

    it('существующие поставки не пересоздаются', async () => {
        const { service, supplyService } = makeService(['internet_1']);
        const report = await service.seedSupplies(false);

        expect(report.created).toBe(18);
        const codes = supplyService.create.mock.calls.map(
            ([supply]: [{ code: string }]) => supply.code,
        );
        expect(codes).not.toContain('internet_1');
    });

    it('универсальный комплект получает рабс = цена фида / рабс региона', async () => {
        const { service, complectService } = makeService();
        const report = await service.seedUniversalComplects(feed(), false);

        // classic есть в фиде, остальные 8 скипнуты из-за отсутствия данных
        expect(report.created).toBe(1);
        expect(report.skipped).toHaveLength(8);
        expect(complectService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'classic',
                type: 'universal',
                abs: '200', // 835440 / 4177.2
                withABS: true,
            }),
        );
    });

    it('сид пакетов создаёт LT, СТАР и консалтинг с рабсами из фида', async () => {
        const { service, packageService } = makeService();
        const report = await service.seedServicePackages(feed(), false);

        // 3 LT + starpack + 2 консалтинга
        expect(report.created).toBe(6);
        expect(packageService.create).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'ltpackSmall', productType: 'lt' }),
        );
        expect(packageService.create).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'starpack', weight: 10 }),
        );
        expect(packageService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'pkpremium',
                abs: 3,
                withABS: true,
            }),
        );
    });

    it('dryRun ничего не создаёт', async () => {
        const { service, supplyService, packageService } = makeService();
        await service.seedSupplies(true);
        await service.seedServicePackages(feed(), true);

        expect(supplyService.create).not.toHaveBeenCalled();
        expect(packageService.create).not.toHaveBeenCalled();
    });
});
