import { PriceTableExportService } from '../services/price-table-export.service';
import { PriceTableImportService } from '../services/price-table-import.service';
import { readSheet, readWorkbook } from '../lib/sheet-reader';
import { writeWorkbook } from '../lib/sheet-writer';
import {
    PRICE_SHEET_MSK,
    PRICE_SHEET_REGIONS,
    PRICE_SHEET_SERVICES,
} from '../lib/price-sheet.schema';

interface PriceRow {
    region_type: string;
    value: number;
    complect_code: string | null;
    supply_code: string | null;
    garant_package_code: string | null;
}

const COMPLECTS = [
    { code: 'buh', name: 'Бухгалтер', productType: 'garant' },
    { code: 'ur', name: 'Юрист', productType: 'garant' },
    { code: 'ltpack', name: 'LT-продукт', productType: 'lt' },
];

const SUPPLIES = [
    { code: 'internet_1', type: 'internet' },
    { code: 'proxima_local', type: 'proxima' },
    { code: 'proxima_flash', type: 'proxima' },
    { code: 'proxima_1', type: 'proxima' },
];

const PACKAGES = [
    { code: 'ltpackSmall', name: 'LT малый', productType: 'lt' },
    { code: 'starpack', name: 'СТАР', productType: 'star' },
    { code: 'pkpremium', name: 'ПК Премиум', productType: 'consalting' },
];

const makeServices = (prices: PriceRow[]) => {
    const store = [...prices];
    const priceService = {
        findMany: jest.fn().mockResolvedValue(store),
        findByUnique: jest
            .fn()
            .mockImplementation(
                (complectCode: string, supplyCode: string, region: string) =>
                    Promise.resolve(
                        store.find(
                            price =>
                                price.complect_code === complectCode &&
                                price.supply_code === supplyCode &&
                                price.region_type === region,
                        ) ?? null,
                    ),
            ),
        findPackagePrice: jest
            .fn()
            .mockImplementation((packageCode: string, region: string) =>
                Promise.resolve(
                    store.find(
                        price =>
                            price.garant_package_code === packageCode &&
                            price.region_type === region,
                    ) ?? null,
                ),
            ),
        storeByComplect: jest.fn().mockResolvedValue({}),
        storeByPackage: jest.fn().mockResolvedValue({}),
    };
    const complectService = { findAll: jest.fn().mockResolvedValue(COMPLECTS) };
    const packageService = { findAll: jest.fn().mockResolvedValue(PACKAGES) };
    const supplyService = { findMany: jest.fn().mockResolvedValue(SUPPLIES) };

    return {
        exportService: new PriceTableExportService(
            priceService as never,
            complectService as never,
            packageService as never,
            supplyService as never,
        ),
        importService: new PriceTableImportService(
            priceService as never,
            complectService as never,
            packageService as never,
            supplyService as never,
        ),
        priceService,
    };
};

const profPrice = (
    complect: string,
    supply: string,
    region: string,
    value: number,
): PriceRow => ({
    region_type: region,
    value,
    complect_code: complect,
    supply_code: supply,
    garant_package_code: null,
});

/** Книга в формате эталона цен */
const buildPriceWorkbook = async (options: {
    regionsRows?: (string | number | null)[][];
    mskRows?: (string | number | null)[][];
    serviceRows?: (string | number | null)[][];
    supplyColumns?: string[];
}): Promise<Buffer> => {
    const supplyColumns = options.supplyColumns ?? [
        'internet_1',
        'proxima_local',
    ];
    const headers = ['complect_code', 'name', ...supplyColumns];
    return await writeWorkbook([
        {
            name: PRICE_SHEET_REGIONS,
            headers,
            rows: options.regionsRows ?? [],
        },
        { name: PRICE_SHEET_MSK, headers, rows: options.mskRows ?? [] },
        {
            name: PRICE_SHEET_SERVICES,
            headers: ['package_code', 'name', 'msk', 'regions'],
            rows: options.serviceRows ?? [],
        },
    ]);
};

describe('PriceTableExportService', () => {
    it('выгружает матрицу: строка — комплект, колонка — поставка, по листу на регионы и Москву', async () => {
        const { exportService } = makeServices([
            profPrice('buh', 'internet_1', '0', 8187),
            profPrice('buh', 'internet_1', '1', 9500),
            {
                region_type: '1',
                value: 4600,
                complect_code: null,
                supply_code: null,
                garant_package_code: 'starpack',
            },
        ]);

        const workbook = await readWorkbook(await exportService.export());
        const regions = readSheet(workbook, PRICE_SHEET_REGIONS);
        const msk = readSheet(workbook, PRICE_SHEET_MSK);
        const services = readSheet(workbook, PRICE_SHEET_SERVICES);

        // prof-листы: только комплекты гаранта, lt-продукт уехал из матрицы
        expect(regions.rows.map(row => row.string('complect_code'))).toEqual([
            'buh',
            'ur',
        ]);
        expect(regions.rows[0].number('internet_1')).toBe(8187);
        expect(msk.rows[0].number('internet_1')).toBe(9500);
        // пустая цена остаётся пустой, а не нулём
        expect(regions.rows[1].nullableString('internet_1')).toBeNull();

        // особые проксимы — отдельные колонки, это не дубли
        expect(regions.headers).toContain('proxima_local');
        expect(regions.headers).toContain('proxima_flash');
        expect(regions.headers).toContain('proxima_1');

        // услуги: только пакеты с ценами (LT и СТАР), консалтинг с рабсами не тут
        expect(services.rows.map(row => row.string('package_code'))).toEqual([
            'ltpackSmall',
            'starpack',
        ]);
        const star = services.rows.find(
            row => row.string('package_code') === 'starpack',
        );
        expect(star?.number('msk')).toBe(4600);
    });

    it('выгруженный эталон читается импортом без правок (круг export → import)', async () => {
        const prices = [
            profPrice('buh', 'internet_1', '0', 8187),
            profPrice('buh', 'proxima_local', '0', 7000),
            profPrice('ur', 'internet_1', '1', 12000),
        ];
        const { exportService, importService, priceService } =
            makeServices(prices);

        const buffer = await exportService.export();
        const reports = await importService.import(buffer, false);

        // всё совпало с БД → ни одной записи
        const total = reports.reduce(
            (sum, report) => sum + report.created + report.updated,
            0,
        );
        expect(total).toBe(0);
        expect(reports.every(report => report.skipped.length === 0)).toBe(true);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
    });
});

describe('PriceTableImportService', () => {
    it('создаёт и обновляет цены по кодам комплекта и поставки', async () => {
        const { importService, priceService } = makeServices([
            profPrice('buh', 'internet_1', '0', 8000),
        ]);
        const buffer = await buildPriceWorkbook({
            regionsRows: [
                ['buh', 'Бухгалтер', 8187, 7000],
                ['ur', 'Юрист', 9000, null],
            ],
        });

        const [regions] = await importService.import(buffer, false);

        expect(regions.updated).toBe(1); // buh/internet_1 8000 → 8187
        expect(regions.created).toBe(2); // buh/proxima_local и ur/internet_1
        expect(regions.skipped).toHaveLength(0);
        expect(priceService.storeByComplect).toHaveBeenCalledWith(
            expect.objectContaining({
                complectCode: 'buh',
                supplyCode: 'proxima_local',
                supplyType: 'proxima',
                supplyTypeCode: '1',
                region_type: '0',
                value: 7000,
            }),
        );
    });

    it('повторная загрузка того же файла ничего не пишет (unchanged)', async () => {
        const { importService, priceService } = makeServices([
            profPrice('buh', 'internet_1', '0', 8187),
        ]);
        const buffer = await buildPriceWorkbook({
            regionsRows: [['buh', 'Бухгалтер', 8187, null]],
        });

        const [regions] = await importService.import(buffer, false);

        expect(regions.unchanged).toBe(1);
        expect(regions.created).toBe(0);
        expect(regions.updated).toBe(0);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
    });

    it('пустая ячейка значит «не менять», а не обнулить', async () => {
        const { importService, priceService } = makeServices([
            profPrice('buh', 'internet_1', '0', 8187),
        ]);
        const buffer = await buildPriceWorkbook({
            regionsRows: [['buh', 'Бухгалтер', null, null]],
        });

        const [regions] = await importService.import(buffer, false);

        expect(regions.created + regions.updated).toBe(0);
        expect(regions.skipped).toHaveLength(0);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
    });

    it('неизвестные коды и мусор в цене попадают в отчёт с причиной', async () => {
        const { importService } = makeServices([]);
        const buffer = await buildPriceWorkbook({
            regionsRows: [
                ['nope', 'Нет такого', 100, null],
                ['buh', 'Бухгалтер', 'уточнить', -5],
                [null, 'Без кода', 100, null],
            ],
            supplyColumns: ['internet_1', 'internet_7'],
        });

        const [regions] = await importService.import(buffer, false);

        const reasons = regions.skipped.map(row => row.reason).join(' | ');
        expect(regions.skipped).toHaveLength(4);
        expect(reasons).toContain('комплект с таким кодом не найден');
        expect(reasons).toContain('не похоже на цену');
        expect(reasons).toContain('не найден в справочнике'); // internet_7
        expect(reasons).toContain('пустой complect_code');
    });

    it('цены пакетов берутся с листа услуг: msk → Москва, regions → регионы', async () => {
        const { importService, priceService } = makeServices([]);
        const buffer = await buildPriceWorkbook({
            serviceRows: [
                ['starpack', 'СТАР', 4600, 3800],
                ['nosuch', 'Нет такого', 100, 100],
            ],
        });

        const reports = await importService.import(buffer, false);
        const services = reports[reports.length - 1];

        expect(services.created).toBe(2);
        expect(services.skipped).toHaveLength(1);
        expect(priceService.storeByPackage).toHaveBeenCalledWith(
            expect.objectContaining({
                garantPackageCode: 'starpack',
                region_type: '1',
                value: 4600,
            }),
        );
        expect(priceService.storeByPackage).toHaveBeenCalledWith(
            expect.objectContaining({
                garantPackageCode: 'starpack',
                region_type: '0',
                value: 3800,
            }),
        );
    });

    it('dryRun считает изменения, но не пишет', async () => {
        const { importService, priceService } = makeServices([]);
        const buffer = await buildPriceWorkbook({
            regionsRows: [['buh', 'Бухгалтер', 8187, null]],
            serviceRows: [['starpack', 'СТАР', 4600, 3800]],
        });

        const reports = await importService.import(buffer, true);

        const created = reports.reduce(
            (sum, report) => sum + report.created,
            0,
        );
        expect(created).toBe(3);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
        expect(priceService.storeByPackage).not.toHaveBeenCalled();
    });

    it('файл без нужного листа отклоняется с понятной ошибкой', async () => {
        const { importService } = makeServices([]);
        const buffer = await writeWorkbook([
            { name: 'Лист1', headers: ['code'], rows: [['buh']] },
        ]);

        await expect(importService.import(buffer, false)).rejects.toThrow(
            /prof-regions/,
        );
    });
});
