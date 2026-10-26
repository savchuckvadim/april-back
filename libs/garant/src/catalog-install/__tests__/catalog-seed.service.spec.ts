import { CatalogSeedService } from '../services/catalog-seed.service';

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
    const service = new CatalogSeedService(
        supplyService as never,
        complectService as never,
        packageService as never,
    );
    return { service, supplyService, complectService, packageService };
};

describe('CatalogSeedService', () => {
    it('сидирует 19 поставок легаси-сетки с кодами internet_*/proxima_*', async () => {
        const { service, supplyService } = makeService();
        const report = await service.seedSupplies(false);

        expect(report.created).toBe(19);
        const codes = supplyService.create.mock.calls.map(
            ([supply]: [{ code: string }]) => supply.code,
        );
        expect(codes).toContain('internet_std');
        expect(codes).toContain('proxima_local');
        expect(codes).toContain('proxima_flash');
        expect(codes).toContain('proxima_1');
        expect(codes).toContain('internet_50');
    });

    it('существующие поставки не пересоздаются и учтены как unchanged', async () => {
        const { service, supplyService } = makeService(['internet_1']);
        const report = await service.seedSupplies(false);

        expect(report.created).toBe(18);
        expect(report.unchanged).toBe(1);
        const codes = supplyService.create.mock.calls.map(
            ([supply]: [{ code: string }]) => supply.code,
        );
        expect(codes).not.toContain('internet_1');
    });

    it('универсальная линейка создаётся с рабсами из констант', async () => {
        const { service, complectService } = makeService();
        const report = await service.seedUniversalComplects(false);

        expect(report.created).toBe(9);
        expect(complectService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'classic',
                type: 'universal',
                abs: '200',
                withABS: true,
            }),
        );
        expect(complectService.create).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'maximum', abs: '1400' }),
        );
    });

    it('сид пакетов создаёт LT, СТАР и консалтинг с рабсами', async () => {
        const { service, packageService } = makeService();
        const report = await service.seedServicePackages(false);

        // 3 LT + starpack + 3 консалтинга
        expect(report.created).toBe(7);
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
        expect(packageService.create).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'hotline', abs: 0 }),
        );
    });

    it('dryRun ничего не создаёт', async () => {
        const { service, supplyService, packageService, complectService } =
            makeService();
        await service.seedSupplies(true);
        await service.seedUniversalComplects(true);
        await service.seedServicePackages(true);

        expect(supplyService.create).not.toHaveBeenCalled();
        expect(complectService.create).not.toHaveBeenCalled();
        expect(packageService.create).not.toHaveBeenCalled();
    });
});
