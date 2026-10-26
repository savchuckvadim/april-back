import { RegionTableService } from '../services/region-table.service';
import { RegionEntity } from '../../region/region.entity';
import { readSheet, readWorkbook } from '../lib/sheet-reader';
import { writeWorkbook } from '../lib/sheet-writer';

const region = (overrides: Partial<RegionEntity> = {}): RegionEntity => ({
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

const makeService = (existing: RegionEntity[]) => {
    const regionService = {
        findAll: jest.fn().mockResolvedValue(existing),
        create: jest
            .fn()
            .mockImplementation((data: Partial<RegionEntity>) =>
                Promise.resolve({ ...region(), ...data }),
            ),
        update: jest
            .fn()
            .mockImplementation((data: Partial<RegionEntity>) =>
                Promise.resolve({ ...region(), ...data }),
            ),
    };
    return {
        service: new RegionTableService(regionService as never),
        regionService,
    };
};

const buildFile = async (
    rows: (string | number | null)[][],
    headers = ['code', 'title', 'infoblock', 'abs', 'number'],
): Promise<Buffer> => await writeWorkbook([{ name: 'regions', headers, rows }]);

describe('RegionTableService', () => {
    it('выгружает регионы с рабсом; НДС-поля в файл не попадают', async () => {
        const { service } = makeService([region()]);
        const sheet = readSheet(
            await readWorkbook(await service.export()),
            'regions',
        );

        expect(sheet.headers).toEqual([
            'code',
            'title',
            'infoblock',
            'abs',
            'number',
        ]);
        expect(sheet.rows[0].number('abs')).toBe(4177.2);
    });

    it('круг export → import без правок ничего не меняет', async () => {
        const { service, regionService } = makeService([region()]);
        const [report] = await service.import(await service.export(), false);

        expect(report.unchanged).toBe(1);
        expect(report.updated).toBe(0);
        expect(regionService.update).not.toHaveBeenCalled();
    });

    it('обновляет рабс и пересчитывает рабс с НДС', async () => {
        const { service, regionService } = makeService([region()]);
        const [report] = await service.import(
            await buildFile([
                ['ud', 'Алтайский край', 'Законодательство', 5000, 0],
            ]),
            false,
        );

        expect(report.updated).toBe(1);
        expect(regionService.update).toHaveBeenCalledWith(
            expect.objectContaining({ abs: 5000, tax_abs: 6000 }),
        );
    });

    it('создаёт новый регион строкой с новым кодом', async () => {
        const { service, regionService } = makeService([region()]);
        const [report] = await service.import(
            await buildFile([
                ['msk', 'Москва', 'Московское право', 9000, null],
            ]),
            false,
        );

        expect(report.created).toBe(1);
        expect(regionService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'msk',
                title: 'Москва',
                abs: 9000,
                tax_abs: 10800,
                number: 1,
            }),
        );
    });

    it('новый регион без названия или рабса отклоняется с причиной', async () => {
        const { service } = makeService([]);
        const [report] = await service.import(
            await buildFile([
                ['msk', null, null, 9000, null],
                ['spb', 'Петербург', null, null, null],
            ]),
            false,
        );

        expect(report.created).toBe(0);
        expect(report.skipped).toHaveLength(2);
        expect(report.skipped[0].reason).toContain('title');
    });

    it('мусор в рабсе не затирает цифру, а попадает в отчёт', async () => {
        const { service, regionService } = makeService([region()]);
        const [report] = await service.import(
            await buildFile([['ud', null, null, 'уточнить', null]]),
            false,
        );

        expect(report.skipped).toHaveLength(1);
        expect(report.skipped[0].reason).toContain('не похоже на число');
        expect(regionService.update).not.toHaveBeenCalled();
    });

    it('dryRun не пишет', async () => {
        const { service, regionService } = makeService([region()]);
        const [report] = await service.import(
            await buildFile([['ud', null, null, 5000, null]]),
            true,
        );

        expect(report.updated).toBe(1);
        expect(regionService.update).not.toHaveBeenCalled();
    });
});
