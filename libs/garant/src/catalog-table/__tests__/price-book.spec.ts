import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PriceBookExportService } from '../services/price-book-export.service';
import { PriceBookImportService } from '../services/price-book-import.service';
import { readSheet, readWorkbook } from '../lib/sheet-reader';
import { ExportSheet, writeWorkbook } from '../lib/sheet-writer';
import {
    PRICE_BOOK_SHEETS,
    odColumnHeader,
    parseOdHeader,
} from '../lib/price-book.schema';
import {
    odColumnsFromSupplies,
    odForSupply,
    suppliesForOd,
} from '../lib/prof-price-expand';
import { ComplectTypeEnum } from '../../complect/types/complect.type';
import { PackageProductTypeEnum } from '../../package/types/package.type';

/** Справочник поставок: эталонная сетка ОД + особые поставки */
const SUPPLIES = [
    { code: 'internet_std', type: 'internet', usersQuantity: 0 },
    { code: 'internet_1', type: 'internet', usersQuantity: 1 },
    { code: 'internet_2', type: 'internet', usersQuantity: 2 },
    { code: 'internet_10', type: 'internet', usersQuantity: 10 },
    { code: 'proxima_local', type: 'proxima', usersQuantity: 1 },
    { code: 'proxima_flash', type: 'proxima', usersQuantity: 1 },
    { code: 'proxima_1', type: 'proxima', usersQuantity: 1 },
    { code: 'proxima_10', type: 'proxima', usersQuantity: 10 },
];

const COMPLECTS = [
    {
        id: '1',
        code: 'buh',
        name: 'Бухгалтер',
        number: 0,
        type: ComplectTypeEnum.PROF,
        weight: 0,
        abs: null,
        infoblocks: [],
    },
    {
        id: '2',
        code: 'classic',
        name: 'Классик',
        number: 9,
        type: ComplectTypeEnum.UNIVERSAL,
        weight: 1,
        abs: '2',
        infoblocks: [{ id: '7' }],
    },
];

const PACKAGES = [
    {
        id: '10',
        code: 'lt_package_small',
        name: 'Малый пакет',
        fullName: 'Малый пакет',
        number: 13,
        weight: 2,
        abs: 0,
        productType: PackageProductTypeEnum.LT,
    },
    {
        id: '11',
        code: 'star',
        name: 'СТАР',
        fullName: 'СТАР',
        number: 1,
        weight: 10,
        abs: 0,
        productType: PackageProductTypeEnum.STAR,
    },
    {
        id: '12',
        code: 'pkpremium',
        name: 'Правовой консалтинг',
        fullName: 'Правовой консалтинг. Премиум',
        number: 2,
        weight: 0,
        abs: 3,
        productType: PackageProductTypeEnum.CONSALING,
    },
];

const REGIONS = [
    {
        id: '1',
        code: 'ud',
        title: 'Алтайский край',
        infoblock: 'Законодательство Алтайского края',
        number: 0,
        abs: 3027,
        tax: 1.2,
        tax_abs: 3632.4,
    },
];

interface PriceRow {
    region_type: string;
    value: number;
    complect_code: string | null;
    supply_code: string | null;
    garant_package_code: string | null;
}

const makeServices = (prices: PriceRow[] = []) => {
    const priceService = {
        findMany: jest.fn().mockResolvedValue(prices),
        findByUnique: jest
            .fn()
            .mockImplementation(
                (complectCode: string, supplyCode: string, region: string) =>
                    Promise.resolve(
                        prices.find(
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
                    prices.find(
                        price =>
                            price.garant_package_code === packageCode &&
                            price.region_type === region,
                    ) ?? null,
                ),
            ),
        storeByComplect: jest.fn().mockResolvedValue({}),
        storeByPackage: jest.fn().mockResolvedValue({}),
    };
    const complectService = {
        findAll: jest.fn().mockResolvedValue(COMPLECTS),
        update: jest.fn().mockResolvedValue({ id: '2' }),
    };
    const packageService = {
        findAll: jest.fn().mockResolvedValue(PACKAGES),
        update: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const supplyService = { findMany: jest.fn().mockResolvedValue(SUPPLIES) };
    const regionService = {
        findAll: jest.fn().mockResolvedValue(REGIONS),
        update: jest.fn().mockResolvedValue(REGIONS[0]),
    };

    return {
        exportService: new PriceBookExportService(
            priceService as never,
            complectService as never,
            packageService as never,
            supplyService as never,
            regionService as never,
        ),
        importService: new PriceBookImportService(
            priceService as never,
            complectService as never,
            packageService as never,
            supplyService as never,
            regionService as never,
        ),
        priceService,
        complectService,
        packageService,
        regionService,
    };
};

/** Книга в формате эталона — минимальный набор листов для теста */
const buildBook = async (options: {
    profMsk?: (string | number | null)[][];
    odHeaders?: string[];
    regions?: (string | number | null)[][];
    universal?: (string | number | null)[][];
    lt?: (string | number | null)[][];
    consalting?: (string | number | null)[][];
}): Promise<Buffer> => {
    const odHeaders = options.odHeaders ?? ['1 ОД*', '10 ОД**'];
    const sheets: ExportSheet[] = [];
    if (options.regions) {
        sheets.push({
            name: PRICE_BOOK_SHEETS.regions,
            headers: ['id', 'title', 'rabs', 'name', 'Infoblock'],
            rows: options.regions,
        });
    }
    if (options.universal) {
        sheets.push({
            name: PRICE_BOOK_SHEETS.universalWeights,
            headers: ['Название', 'Вес', 'АБС'],
            rows: options.universal,
        });
    }
    if (options.profMsk) {
        sheets.push({
            name: PRICE_BOOK_SHEETS.profMsk,
            headers: [
                'complectName',
                'ComplectNumber',
                'complectCode',
                ...odHeaders,
            ],
            rows: options.profMsk,
        });
    }
    if (options.lt) {
        sheets.push({
            name: PRICE_BOOK_SHEETS.lt,
            headers: ['id', 'name', 'weight', 'msk', 'regions', 'code'],
            rows: options.lt,
        });
    }
    if (options.consalting) {
        sheets.push({
            name: PRICE_BOOK_SHEETS.consalting,
            headers: ['id', 'name', 'title', 'abs', 'code'],
            rows: options.consalting,
        });
    }
    return await writeWorkbook(sheets);
};

describe('схема книги цен', () => {
    it('читает число ОД из заголовка со звёздочками', () => {
        expect(parseOdHeader('1 ОД*')).toBe(1);
        expect(parseOdHeader('10 ОД**')).toBe(10);
        expect(parseOdHeader(' 50 ОД** ')).toBe(50);
        expect(parseOdHeader('complectCode')).toBeNull();
        expect(parseOdHeader('')).toBeNull();
    });

    it('строит заголовок колонки как в эталоне', () => {
        expect(odColumnHeader(1)).toBe('1 ОД*');
        expect(odColumnHeader(5)).toBe('5 ОД*');
        expect(odColumnHeader(10)).toBe('10 ОД**');
    });
});

describe('цена по ОД → виды поставок', () => {
    it('одна цена достаётся и интернету, и проксиме с тем же числом ОД', () => {
        const codes = suppliesForOd(SUPPLIES, 10).map(supply => supply.code);

        expect(codes).toEqual(['internet_10', 'proxima_10']);
    });

    it('особые поставки берут цену колонки «1 ОД»', () => {
        const codes = suppliesForOd(SUPPLIES, 1).map(supply => supply.code);

        expect(codes).toContain('internet_1');
        expect(codes).toContain('proxima_1');
        expect(codes).toContain('internet_std');
        expect(codes).toContain('proxima_local');
        expect(codes).toContain('proxima_flash');
    });

    it('особые поставки не попадают в другие колонки ОД', () => {
        const codes = suppliesForOd(SUPPLIES, 10).map(supply => supply.code);

        expect(codes).not.toContain('internet_std');
        expect(codes).not.toContain('proxima_flash');
    });

    it('обратное преобразование: особая поставка считается как 1 ОД', () => {
        expect(odForSupply(SUPPLIES[0])).toBe(1); // internet_std, 0 ОД в карточке
        expect(odForSupply(SUPPLIES[3])).toBe(10);
    });

    it('колонки прайса строятся по числам ОД справочника без повторов', () => {
        expect(odColumnsFromSupplies(SUPPLIES)).toEqual([1, 2, 10]);
    });
});

describe('PriceBookExportService', () => {
    it('выгружает книгу в формате эталона: 7 листов с теми же именами', async () => {
        const { exportService } = makeServices();
        const workbook = await readWorkbook(
            await exportService.export('current'),
        );
        const names = workbook.worksheets.map(sheet => sheet.name);

        for (const expected of Object.values(PRICE_BOOK_SHEETS)) {
            expect(names).toContain(expected);
        }
    });

    it('прайс PROF: колонки — ОД, универсальных комплектов в нём нет', async () => {
        const { exportService } = makeServices([
            {
                region_type: '1',
                value: 8587,
                complect_code: 'buh',
                supply_code: 'internet_1',
                garant_package_code: null,
            },
        ]);
        const sheet = readSheet(
            await readWorkbook(await exportService.export('current')),
            PRICE_BOOK_SHEETS.profMsk,
        );

        expect(sheet.headers).toEqual([
            'complectName',
            'ComplectNumber',
            'complectCode',
            '1 ОД*',
            '2 ОД*',
            '10 ОД**',
        ]);
        const codes = sheet.rows.map(row => row.string('complectCode'));
        expect(codes).toEqual(['buh']);
        expect(codes).not.toContain('classic');
        expect(sheet.rows[0].number('1 ОД*')).toBe(8587);
    });

    it('универсальная линейка выгружается весом и АБС, без цен', async () => {
        const { exportService } = makeServices();
        const workbook = await readWorkbook(
            await exportService.export('current'),
        );
        const sheet = readSheet(workbook, PRICE_BOOK_SHEETS.universalWeights);

        expect(sheet.headers).toEqual(['Название', 'Вес', 'АБС']);
        expect(sheet.rows[0].string('Название')).toBe('Классик');
        expect(sheet.rows[0].number('АБС')).toBe(2);
    });

    it('консалтинг выгружается с АБС, цен в нём нет', async () => {
        const { exportService } = makeServices();
        const sheet = readSheet(
            await readWorkbook(await exportService.export('current')),
            PRICE_BOOK_SHEETS.consalting,
        );

        expect(sheet.headers).not.toContain('msk');
        expect(sheet.rows[0].string('code')).toBe('pkpremium');
        expect(sheet.rows[0].number('abs')).toBe(3);
    });

    it('пустой шаблон: ключи на месте, значения пустые', async () => {
        const { exportService } = makeServices([
            {
                region_type: '1',
                value: 8587,
                complect_code: 'buh',
                supply_code: 'internet_1',
                garant_package_code: null,
            },
        ]);
        const workbook = await readWorkbook(
            await exportService.export('blank'),
        );
        const prof = readSheet(workbook, PRICE_BOOK_SHEETS.profMsk);
        const regions = readSheet(workbook, PRICE_BOOK_SHEETS.regions);

        expect(prof.rows[0].string('complectCode')).toBe('buh');
        expect(prof.rows[0].nullableString('1 ОД*')).toBeNull();
        expect(regions.rows[0].string('name')).toBe('ud');
        expect(regions.rows[0].nullableString('rabs')).toBeNull();
    });

    it('круг export → import без правок ничего не меняет', async () => {
        // Цена колонки «1 ОД» действует на все поставки с одним ОД,
        // включая особые — в выгруженном файле она одна, в БД их пять.
        const oneOdSupplies = [
            'internet_1',
            'proxima_1',
            'internet_std',
            'proxima_local',
            'proxima_flash',
        ];
        const prices: PriceRow[] = oneOdSupplies.map(supply_code => ({
            region_type: '1',
            value: 8587,
            complect_code: 'buh',
            supply_code,
            garant_package_code: null,
        }));
        const { exportService, importService, priceService } =
            makeServices(prices);

        const reports = await importService.import(
            await exportService.export('current'),
            false,
        );
        const written =
            priceService.storeByComplect.mock.calls.length +
            priceService.storeByPackage.mock.calls.length;

        expect(written).toBe(0);
        expect(
            reports.every(report => report.created + report.updated === 0),
        ).toBe(true);
    });
});

describe('PriceBookImportService', () => {
    it('цена из колонки ОД разворачивается на все виды поставки с этим ОД', async () => {
        const { importService, priceService } = makeServices();
        const reports = await importService.import(
            await buildBook({
                profMsk: [['Бухгалтер', 0, 'buh', 8587, 27698]],
            }),
            false,
        );
        const prof = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.profMsk,
        );

        // 1 ОД → internet_1, proxima_1, internet_std, proxima_local, proxima_flash (5)
        // 10 ОД → internet_10, proxima_10 (2)
        expect(prof?.created).toBe(7);
        const codes = priceService.storeByComplect.mock.calls.map(
            ([price]: [{ supplyCode: string; value: number }]) =>
                price.supplyCode,
        );
        expect(codes).toContain('internet_1');
        expect(codes).toContain('proxima_flash');
        expect(codes).toContain('proxima_10');
        const tenOd = priceService.storeByComplect.mock.calls
            .map(([price]: [{ supplyCode: string; value: number }]) => price)
            .filter((price: { supplyCode: string }) =>
                price.supplyCode.endsWith('_10'),
            );
        expect(
            tenOd.every((price: { value: number }) => price.value === 27698),
        ).toBe(true);
    });

    it('универсальный комплект в прайсе отклоняется с объяснением', async () => {
        const { importService, priceService } = makeServices();
        const reports = await importService.import(
            await buildBook({
                profMsk: [['Классик', 9, 'classic', 5000, null]],
            }),
            false,
        );
        const prof = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.profMsk,
        );

        expect(prof?.skipped).toHaveLength(1);
        expect(prof?.skipped[0].reason).toMatch(/универсальной линейки/);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
    });

    it('лист universal-weights обновляет вес и АБС, а не цены', async () => {
        const { importService, complectService } = makeServices();
        const reports = await importService.import(
            await buildBook({ universal: [['Классик', 1.5, 3]] }),
            false,
        );
        const sheet = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.universalWeights,
        );

        expect(sheet?.updated).toBe(1);
        expect(complectService.update).toHaveBeenCalledWith(
            '2',
            expect.objectContaining({
                code: 'classic',
                weight: 1.5,
                abs: '3',
                infoblockIds: ['7'],
            }),
        );
    });

    it('лист regions обновляет рабс и считает рабс с НДС', async () => {
        const { importService, regionService } = makeServices();
        const reports = await importService.import(
            await buildBook({
                regions: [
                    [0, 'Алтайский край', 5000, 'ud', 'Законодательство'],
                ],
            }),
            false,
        );
        const sheet = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.regions,
        );

        expect(sheet?.updated).toBe(1);
        expect(regionService.update).toHaveBeenCalledWith(
            expect.objectContaining({ abs: 5000, tax_abs: 6000 }),
        );
    });

    it('лист lt пишет цены пакета по Москве и регионам', async () => {
        const { importService, priceService } = makeServices();
        const reports = await importService.import(
            await buildBook({
                lt: [[13, 'Малый пакет', 2, 1692, 1512, 'lt_package_small']],
            }),
            false,
        );
        const sheet = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.lt,
        );

        expect(sheet?.created).toBe(2);
        expect(priceService.storeByPackage).toHaveBeenCalledWith(
            expect.objectContaining({
                garantPackageCode: 'lt_package_small',
                region_type: '1',
                value: 1692,
            }),
        );
    });

    it('лист consalting обновляет АБС, цен не пишет', async () => {
        const { importService, packageService, priceService } = makeServices();
        const reports = await importService.import(
            await buildBook({
                consalting: [
                    [2, 'Правовой консалтинг', 'Премиум', 5, 'pkpremium'],
                ],
            }),
            false,
        );
        const sheet = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.consalting,
        );

        expect(sheet?.updated).toBe(1);
        expect(packageService.update).toHaveBeenCalledWith('12', { abs: 5 });
        expect(priceService.storeByPackage).not.toHaveBeenCalled();
    });

    it('пустая ячейка значит «не менять»', async () => {
        const { importService, priceService } = makeServices();
        await importService.import(
            await buildBook({ profMsk: [['Бухгалтер', 0, 'buh', null, null]] }),
            false,
        );

        expect(priceService.storeByComplect).not.toHaveBeenCalled();
    });

    it('мусор в цене и неизвестный комплект попадают в отчёт', async () => {
        const { importService } = makeServices();
        const reports = await importService.import(
            await buildBook({
                profMsk: [
                    ['Бухгалтер', 0, 'buh', 'уточнить', null],
                    ['Нет такого', 99, 'nope', 100, null],
                ],
            }),
            false,
        );
        const prof = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.profMsk,
        );
        const reasons = (prof?.skipped ?? [])
            .map(row => row.reason)
            .join(' | ');

        expect(prof?.skipped).toHaveLength(2);
        expect(reasons).toMatch(/не похоже на цену/);
        expect(reasons).toMatch(/нет среди PROF-комплектов/);
    });

    it('dryRun считает, но не пишет', async () => {
        const { importService, priceService, regionService } = makeServices();
        const reports = await importService.import(
            await buildBook({
                profMsk: [['Бухгалтер', 0, 'buh', 8587, null]],
                regions: [[0, 'Алтайский край', 5000, 'ud', '']],
            }),
            true,
        );
        const total = reports.reduce(
            (sum, report) => sum + report.created + report.updated,
            0,
        );

        expect(total).toBeGreaterThan(0);
        expect(priceService.storeByComplect).not.toHaveBeenCalled();
        expect(regionService.update).not.toHaveBeenCalled();
    });

    it('файл без знакомых листов отклоняется с подсказкой', async () => {
        const { importService } = makeServices();
        const foreign = await writeWorkbook([
            { name: 'Лист1', headers: ['code'], rows: [['buh']] },
        ]);

        await expect(importService.import(foreign, false)).rejects.toThrow(
            /prof-prices-msc/,
        );
    });
});

/**
 * Проверка на рабочем файле владельца: читается ли он без ошибок и
 * опознаются ли все листы. Если файла нет (чистое окружение, CI) —
 * тест сообщает об этом и не падает.
 */
describe('рабочий файл цен', () => {
    const referencePath = join(
        process.cwd(),
        'storage',
        'app',
        'garant',
        'prices.xlsx',
    );

    it('эталонный prices.xlsx разбирается всеми листами', async () => {
        if (!existsSync(referencePath)) {
            console.warn(
                `Пропуск: нет ${referencePath} — проверка на рабочем файле не выполнена`,
            );
            return;
        }
        const { importService } = makeServices();
        const reports = await importService.import(
            await readFile(referencePath),
            true, // только чтение, без записи
        );
        const sections = reports.map(report => report.section);

        expect(sections).toContain(PRICE_BOOK_SHEETS.regions);
        expect(sections).toContain(PRICE_BOOK_SHEETS.universalWeights);
        expect(sections).toContain(PRICE_BOOK_SHEETS.profMsk);
        expect(sections).toContain(PRICE_BOOK_SHEETS.profRegions);
        expect(sections).toContain(PRICE_BOOK_SHEETS.lt);
        expect(sections).toContain(PRICE_BOOK_SHEETS.star);
        expect(sections).toContain(PRICE_BOOK_SHEETS.consalting);

        // В прайсе эталона есть цены «Бухгалтера» — значит колонки ОД прочитаны
        const prof = reports.find(
            report => report.section === PRICE_BOOK_SHEETS.profMsk,
        );
        expect((prof?.created ?? 0) + (prof?.updated ?? 0)).toBeGreaterThan(0);
    });
});
