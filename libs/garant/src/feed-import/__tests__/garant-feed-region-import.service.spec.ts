import { GarantFeedRegionImportService } from '../services/garant-feed-region-import.service';
import { RegionEntity } from '../../region/region.entity';
import { FeedRegionRow } from '../types/garant-feed.types';

const feedRow = (overrides: Partial<FeedRegionRow> = {}): FeedRegionRow => ({
    number: 0,
    title: 'Алтайский край',
    abs: 5000,
    name: 'ud',
    infoblock: 'Законодательство Алтайского края',
    ...overrides,
});

const dbRegion = (overrides: Partial<RegionEntity> = {}): RegionEntity => ({
    id: '1',
    number: 0,
    title: 'Алтайский край',
    code: 'ud',
    infoblock: 'Законодательство Алтайского края',
    abs: 4177.2,
    tax: 1.2,
    tax_abs: 5012.64,
    ...overrides,
});

describe('GarantFeedRegionImportService', () => {
    const makeService = (existing: RegionEntity[]) => {
        const regionService = {
            findAll: jest.fn().mockResolvedValue(existing),
            update: jest
                .fn()
                .mockImplementation((patch: Partial<RegionEntity>) =>
                    Promise.resolve({ ...existing[0], ...patch }),
                ),
            create: jest
                .fn()
                .mockImplementation((region: Partial<RegionEntity>) =>
                    Promise.resolve({ ...dbRegion(), ...region }),
                ),
        };
        const service = new GarantFeedRegionImportService(
            regionService as never,
        );
        return { service, regionService };
    };

    it('обновляет рабс существующего региона и пересчитывает tax_abs', async () => {
        const { service, regionService } = makeService([dbRegion()]);
        const report = await service.import([feedRow({ abs: 5000 })], false);

        expect(report.updated).toBe(1);
        expect(regionService.update).toHaveBeenCalledWith(
            expect.objectContaining({
                id: '1',
                abs: 5000,
                tax_abs: 6000,
            }),
        );
    });

    it('не трогает регион, если рабс не изменился', async () => {
        const { service, regionService } = makeService([
            dbRegion({ abs: 5000, tax_abs: 6000 }),
        ]);
        const report = await service.import([feedRow({ abs: 5000 })], false);

        expect(report.updated).toBe(0);
        expect(regionService.update).not.toHaveBeenCalled();
    });

    it('создаёт отсутствующий регион целиком', async () => {
        const { service, regionService } = makeService([]);
        const report = await service.import([feedRow()], false);

        expect(report.created).toBe(1);
        expect(regionService.create).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'ud', abs: 5000, tax_abs: 6000 }),
        );
    });

    it('пропускает строку с неположительным рабсом', async () => {
        const { service } = makeService([dbRegion()]);
        const report = await service.import([feedRow({ abs: 0 })], false);

        expect(report.skipped).toHaveLength(1);
        expect(report.updated).toBe(0);
    });

    it('dryRun считает изменения, но не пишет', async () => {
        const { service, regionService } = makeService([dbRegion()]);
        const report = await service.import(
            [feedRow({ abs: 5000 }), feedRow({ name: 'new', title: 'Новый' })],
            true,
        );

        expect(report.updated).toBe(1);
        expect(report.created).toBe(1);
        expect(regionService.update).not.toHaveBeenCalled();
        expect(regionService.create).not.toHaveBeenCalled();
    });
});
