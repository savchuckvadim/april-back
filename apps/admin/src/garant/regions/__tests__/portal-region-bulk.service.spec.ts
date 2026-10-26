import { PortalRegionService } from '../services/portal-region.service';

const makeService = (enabledRegionIds: number[]) => {
    const regionService = {
        findByPortalId: jest
            .fn()
            .mockResolvedValue(
                enabledRegionIds.map(id => ({ id: String(id) })),
            ),
        createPortalRegion: jest.fn().mockResolvedValue({ id: '1' }),
        deletePortalRegion: jest.fn().mockResolvedValue(true),
        updatePortalRegion: jest.fn().mockResolvedValue({ id: '1' }),
    };
    const portalService = {};
    const service = new PortalRegionService(
        regionService as never,
        portalService as never,
    );
    return { service, regionService };
};

describe('PortalRegionService.bulkSetPortalRegions', () => {
    it('включает невключённый регион и ставит собственный рабс', async () => {
        const { service, regionService } = makeService([]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true, ownAbs: '5000.00' }],
        });

        expect(result.enabled).toBe(1);
        expect(result.updatedOwn).toBe(1);
        expect(regionService.createPortalRegion).toHaveBeenCalledWith(3, 12);
        const [, , abs, tax, taxAbs] = regionService.updatePortalRegion.mock
            .calls[0] as [
            number,
            number,
            { toString(): string },
            { toString(): string },
            { toString(): string },
        ];
        expect(abs.toString()).toBe('5000');
        expect(tax.toString()).toBe('1.2');
        expect(taxAbs.toString()).toBe('6000');
    });

    it('уже включённый регион не создаётся повторно, но own обновляется', async () => {
        const { service, regionService } = makeService([12]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true, ownAbs: '4000' }],
        });

        expect(result.enabled).toBe(0);
        expect(result.updatedOwn).toBe(1);
        expect(regionService.createPortalRegion).not.toHaveBeenCalled();
    });

    it('без ownAbs собственный рабс не трогается', async () => {
        const { service, regionService } = makeService([]);
        await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true }],
        });

        expect(regionService.updatePortalRegion).not.toHaveBeenCalled();
    });

    it('ownAbs: null сбрасывает own-поля в 0', async () => {
        const { service, regionService } = makeService([12]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true, ownAbs: null }],
        });

        expect(result.updatedOwn).toBe(1);
        const [, , abs, tax, taxAbs] = regionService.updatePortalRegion.mock
            .calls[0] as [
            number,
            number,
            { toString(): string },
            { toString(): string },
            { toString(): string },
        ];
        expect(abs.toString()).toBe('0');
        expect(tax.toString()).toBe('0');
        expect(taxAbs.toString()).toBe('0');
    });

    it('выключение включённого удаляет связь, невключённого — тихий пропуск', async () => {
        const { service, regionService } = makeService([12]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [
                { regionId: 12, enabled: false },
                { regionId: 99, enabled: false },
            ],
        });

        expect(result.disabled).toBe(1);
        expect(regionService.deletePortalRegion).toHaveBeenCalledTimes(1);
        expect(result.skipped).toHaveLength(0);
    });

    it('ошибка включения попадает в skipped и не ломает остальные строки', async () => {
        const { service, regionService } = makeService([]);
        regionService.createPortalRegion
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: '2' });
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [
                { regionId: 12, enabled: true },
                { regionId: 13, enabled: true },
            ],
        });

        expect(result.enabled).toBe(1);
        expect(result.skipped).toEqual([
            { regionId: 12, reason: 'не удалось включить регион' },
        ]);
    });
});
