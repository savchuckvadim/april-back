import { PortalRegionService } from '../services/portal-region.service';

const KNOWN_REGION_IDS = [12, 13, 47, 99];

const makeService = (enabledRegionIds: number[]) => {
    const regionService = {
        findPortalRegionLinks: jest
            .fn()
            .mockResolvedValue(
                enabledRegionIds.map(regionId => ({ regionId })),
            ),
        findAll: jest
            .fn()
            .mockResolvedValue(
                KNOWN_REGION_IDS.map(id => ({ id: String(id) })),
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

const lastPatch = (regionService: { updatePortalRegion: jest.Mock }) => {
    const [call] = regionService.updatePortalRegion.mock.calls as [
        [number, number, Record<string, unknown>],
    ];
    return call[2];
};

describe('PortalRegionService.bulkSetPortalRegions', () => {
    it('включает невключённый регион и ставит ручной рабс', async () => {
        const { service, regionService } = makeService([]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true, ownAbs: '5000.00' }],
        });

        expect(result.enabled).toBe(1);
        expect(result.updatedOwn).toBe(1);
        expect(regionService.createPortalRegion).toHaveBeenCalledWith(3, 12);
        expect(lastPatch(regionService)).toEqual({
            own_abs: '5000.00',
            own_tax: '1.20',
            own_tax_abs: '6000.00',
            own_abs_region_id: null,
        });
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

    it('без ownAbs и ownAbsRegionId своя цена не трогается', async () => {
        const { service, regionService } = makeService([]);
        await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true }],
        });

        expect(regionService.updatePortalRegion).not.toHaveBeenCalled();
    });

    it('ownAbs: null сбрасывает own-поля и источник в NULL', async () => {
        const { service, regionService } = makeService([12]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true, ownAbs: null }],
        });

        expect(result.updatedOwn).toBe(1);
        expect(lastPatch(regionService)).toEqual({
            own_abs: null,
            own_tax: null,
            own_tax_abs: null,
            own_abs_region_id: null,
        });
    });

    it('регион-источник: ссылка ставится, ручные поля сбрасываются', async () => {
        const { service, regionService } = makeService([12]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [{ regionId: 12, enabled: true, ownAbsRegionId: 47 }],
        });

        expect(result.updatedOwn).toBe(1);
        expect(lastPatch(regionService)).toEqual({
            own_abs: null,
            own_tax: null,
            own_tax_abs: null,
            own_abs_region_id: 47,
        });
    });

    it('источник сам на себя или неизвестный — строка в skipped', async () => {
        const { service, regionService } = makeService([12, 13]);
        const result = await service.bulkSetPortalRegions({
            portalId: 3,
            items: [
                { regionId: 12, enabled: true, ownAbsRegionId: 12 },
                { regionId: 13, enabled: true, ownAbsRegionId: 555 },
            ],
        });

        expect(result.updatedOwn).toBe(0);
        expect(regionService.updatePortalRegion).not.toHaveBeenCalled();
        expect(result.skipped.map(row => row.regionId)).toEqual([12, 13]);
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
