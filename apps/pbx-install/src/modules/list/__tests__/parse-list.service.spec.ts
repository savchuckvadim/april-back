import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NotFoundException } from '@nestjs/common';
import { ParseListService } from '../services/parse/parse-list.service';
import { ParseListFieldsService } from '../services/parse/parse-list-fields.service';
import { StorageService } from '@/core/storage';
import { ListFolderEnum, ListGroupEnum } from '../type/parse.type';

/**
 * Тесты ParseListService: чтение листа `lists` нового формата
 * [id, type, group, name, code, order], поиск листов по имени,
 * отсутствие файла/листа → NotFoundException.
 * Шаблон собирается в памяти и пишется во временный xlsx-файл.
 */
describe('ParseListService', () => {
    let service: ParseListService;
    let storage: {
        getFilePath: jest.Mock;
        fileExistsByType: jest.Mock;
    };
    let workbook: ExcelJS.Workbook;
    let tmpDir: string;
    let tmpFile: string;

    const FIELDS_HEADER = [
        'Название поля',
        'appType',
        'type',
        'field_code',
        'field_btx_code',
        'order',
        'isNeedUpdate',
        'isActive',
    ];
    const ITEMS_HEADER = [
        'item_name',
        'field_code',
        'item_code',
        'code',
        'order',
        'del',
        'isActive',
        'isNeedUpdate',
    ];
    const LISTS_HEADER = ['id', 'type', 'group', 'name', 'code', 'order'];

    function addSheet(name: string, rows: unknown[][]) {
        const sheet = workbook.addWorksheet(name);
        rows.forEach(r => sheet.addRow(r));
        return sheet;
    }

    async function flushWorkbook() {
        await workbook.xlsx.writeFile(tmpFile);
    }

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-list-spec-'));
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    beforeEach(() => {
        workbook = new ExcelJS.Workbook();
        tmpFile = path.join(
            tmpDir,
            `data-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`,
        );
        storage = {
            getFilePath: jest.fn().mockImplementation(() => tmpFile),
            fileExistsByType: jest.fn().mockResolvedValue(true),
        };
        service = new ParseListService(
            storage as unknown as StorageService,
            new ParseListFieldsService(),
        );
    });

    it('файл не найден → NotFoundException', async () => {
        storage.fileExistsByType.mockResolvedValue(false);

        await expect(
            service.getParsedData(ListFolderEnum.KPI, ListGroupEnum.SALES),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('парсит строку списка нового формата и подкладывает общие поля', async () => {
        addSheet('colors', [['id', 'value']]);
        addSheet('lists', [
            LISTS_HEADER,
            [0, 'kpi', 'sales', 'ОП KPI', 'kpi', 1],
        ]);
        addSheet('fields', [
            FIELDS_HEADER,
            [
                'Дата',
                'calling',
                'datetime',
                'event_date',
                'EVENT_DATE',
                30,
                true,
                true,
            ],
        ]);
        addSheet('fieldsItems', [ITEMS_HEADER]);
        await flushWorkbook();

        const result = await service.getParsedData(
            ListFolderEnum.KPI,
            ListGroupEnum.SALES,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: '0',
            type: 'kpi',
            group: 'sales',
            name: 'ОП KPI',
            code: 'kpi',
            order: 1,
        });
        expect(result[0].fields).toHaveLength(1);
        expect(result[0].fields[0].code).toBe('event_date');
    });

    it('несколько списков в одном файле получают одинаковый набор полей', async () => {
        addSheet('lists', [
            LISTS_HEADER,
            [0, 'kpi', 'sales', 'ОП KPI', 'kpi', 1],
            [1, 'history', 'sales', 'ОП История', 'history', 2],
        ]);
        addSheet('fields', [
            FIELDS_HEADER,
            [
                'Дата',
                'calling',
                'datetime',
                'event_date',
                'EVENT_DATE',
                30,
                true,
                true,
            ],
        ]);
        addSheet('fieldsItems', [ITEMS_HEADER]);
        await flushWorkbook();

        const result = await service.getParsedData(
            ListFolderEnum.KPI,
            ListGroupEnum.SALES,
        );

        expect(result).toHaveLength(2);
        expect(result[0].fields).toEqual(result[1].fields);
        expect(result.map(l => l.code)).toEqual(['kpi', 'history']);
    });

    it('нет листа lists → NotFoundException', async () => {
        addSheet('fields', [FIELDS_HEADER]);
        addSheet('fieldsItems', [ITEMS_HEADER]);
        await flushWorkbook();

        await expect(
            service.getParsedData(ListFolderEnum.KPI, ListGroupEnum.SALES),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
