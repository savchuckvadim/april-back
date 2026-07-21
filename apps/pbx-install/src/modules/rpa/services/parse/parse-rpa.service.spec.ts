import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { StorageService } from '@/core/storage';
import { ParseRpaService } from './parse-rpa.service';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';

/**
 * Тест парсера на РЕАЛЬНОМ шаблоне `storage/app/install/general/rpa/supply/data.xlsx`,
 * чтобы зафиксировать раскладку листов и маппинг категории/стадий/полей.
 */
describe('ParseRpaService (real template: supply)', () => {
    let service: ParseRpaService;
    const realPath = path.resolve(
        process.cwd(),
        'storage/app/install/general/rpa/supply/data.xlsx',
    );

    beforeEach(() => {
        const storage = {
            getFilePath: jest.fn().mockReturnValue(realPath),
            fileExistsByType: jest.fn().mockResolvedValue(true),
        } as unknown as StorageService;
        service = new ParseRpaService(storage);
    });

    it('парсит один RPA с одной категорией', async () => {
        const result = await service.getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );
        expect(result).toHaveLength(1);
        const rpa = result[0];
        expect(rpa.code).toBe('supply');
        expect(rpa.entityTypeId).toBe('158');
        expect(rpa.categories).toHaveLength(1);
    });

    it('парсит стадии единственной категории с семантикой', async () => {
        const [rpa] = await service.getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );
        const stages = rpa.categories[0].stages;
        expect(stages.length).toBeGreaterThan(0);

        const newStage = stages.find(s => s.code === 'rpa_supply_new');
        expect(newStage).toBeDefined();
        expect(newStage?.isFirst).toBe(true);

        const success = stages.find(s => s.code === 'rpa_supply_success');
        expect(success?.semantic.toUpperCase()).toBe('SUCCESS');
        expect(success?.isSuccess).toBe(true);

        const fail = stages.find(s => s.code === 'rpa_supply_fail');
        expect(fail?.isFail).toBe(true);
    });

    it('парсит поля RPA (берёт суффикс из колонки «Смарт»)', async () => {
        const [rpa] = await service.getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );
        expect(rpa.fields.length).toBeGreaterThan(0);
        // Все поля должны иметь непустой bxFieldName-суффикс.
        expect(rpa.fields.every(f => f.bxFieldName.length > 0)).toBe(true);

        const saleDate = rpa.fields.find(f => f.code === 'sale_date');
        expect(saleDate).toBeDefined();
        expect(saleDate?.bxFieldName).toBe('SALE_DATE');

        const enumField = rpa.fields.find(f => f.type === 'enumeration');
        expect(enumField?.list.length).toBeGreaterThan(0);
    });

    it('бросает 404, если шаблон не найден', async () => {
        const storage = {
            getFilePath: jest.fn().mockReturnValue(realPath),
            fileExistsByType: jest.fn().mockResolvedValue(false),
        } as unknown as StorageService;
        const s = new ParseRpaService(storage);
        await expect(
            s.getParsedData(RpaNameEnum.SUPPLY, RpaGroupEnum.GENERAL),
        ).rejects.toThrow('RPA template not found');
    });
});

/**
 * Синтетический шаблон с той же раскладкой листов, что и реальный:
 * проверяем разбор isMultiple — последней (16-й) колонки листа fields —
 * и обратную совместимость со старыми шаблонами без этой колонки.
 */
describe('ParseRpaService (isMultiple, synthetic template)', () => {
    let tmpDir: string;
    let tmpPath: string;

    const FIELDS_HEADER = [
        'Название поля',
        'appType',
        'type',
        'Значения Списка',
        'КОД',
        'Лид',
        'Компания',
        'Сделка',
        'Смарт',
        'Задача',
        'App',
        'order',
        'Коммент',
        'Задача',
        'isNeedUpdate',
        'isMultiple',
    ];

    /** Строка листа fields: заполнены только значимые для парсера колонки. */
    const fieldRow = (
        code: string,
        smart: string,
        multiple?: boolean,
    ): unknown[] => {
        const row: unknown[] = [
            `Поле ${code}`,
            'rpa_supply',
            'string',
            null,
            code,
            null,
            null,
            null,
            smart,
            null,
            null,
            100,
            null,
            null,
            true,
        ];
        if (multiple !== undefined) {
            row.push(multiple);
        }
        return row;
    };

    const buildTemplate = async (filePath: string): Promise<void> => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('colors');
        const fields = wb.addWorksheet('fields');
        wb.addWorksheet('document_fields');
        const fieldItems = wb.addWorksheet('fieldsItems');
        const rpa = wb.addWorksheet('RPA');
        const categories = wb.addWorksheet('RPACategory');
        const stages = wb.addWorksheet('RPAStages');

        fields.addRow(FIELDS_HEADER);
        fields.addRow(fieldRow('multi_str', 'MULTI_STR', true));
        fields.addRow(fieldRow('single_str', 'SINGLE_STR', false));
        // Строка старого формата — без колонки isMultiple.
        fields.addRow(fieldRow('legacy_str', 'LEGACY_STR'));

        fieldItems.addRow(['field_name', 'field_code', 'item_name']);

        rpa.addRow(['id', 'title', 'name', 'entityTypeId']);
        rpa.addRow([
            '1',
            'Поставка',
            'supply',
            '158',
            'supply',
            'rpa',
            'general',
            '158',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            true,
            true,
            100,
            '',
        ]);

        categories.addRow(['id', 'entityTypeId']);
        categories.addRow([
            'cat1',
            '158',
            null,
            'rpa',
            'general',
            'supply',
            'Поставка',
            '158',
            'dt158',
            'supply_cat',
            true,
            true,
            100,
            'Y',
        ]);

        stages.addRow(['id', 'name', 'title']);

        await wb.xlsx.writeFile(filePath);
    };

    beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-rpa-spec-'));
        tmpPath = path.join(tmpDir, 'data.xlsx');
        await buildTemplate(tmpPath);
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const makeService = (): ParseRpaService => {
        const storage = {
            getFilePath: jest.fn().mockReturnValue(tmpPath),
            fileExistsByType: jest.fn().mockResolvedValue(true),
        } as unknown as StorageService;
        return new ParseRpaService(storage);
    };

    it('парсит isMultiple из последней колонки листа fields', async () => {
        const [rpa] = await makeService().getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );

        const multi = rpa.fields.find(f => f.code === 'multi_str');
        const single = rpa.fields.find(f => f.code === 'single_str');
        expect(multi?.isMultiple).toBe(true);
        expect(single?.isMultiple).toBe(false);
    });

    it('без колонки isMultiple признак остаётся false (старые шаблоны)', async () => {
        const [rpa] = await makeService().getParsedData(
            RpaNameEnum.SUPPLY,
            RpaGroupEnum.GENERAL,
        );

        const legacy = rpa.fields.find(f => f.code === 'legacy_str');
        expect(legacy).toBeDefined();
        expect(legacy?.isMultiple).toBe(false);
    });
});
