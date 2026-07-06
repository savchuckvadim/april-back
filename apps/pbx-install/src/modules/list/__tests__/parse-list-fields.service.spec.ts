import * as ExcelJS from 'exceljs';
import { ParseListFieldsService } from '../services/parse/parse-list-fields.service';

/**
 * Тесты парсера листов fields/fieldsItems шаблона списков:
 * позиции колонок, гейтинг isActive, enum-элементы, тип multiple,
 * booleans как boolean и как строка (включая 'ИСТИНА'/'ЛОЖЬ').
 */
describe('ParseListFieldsService', () => {
    let service: ParseListFieldsService;

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

    function makeSheets(
        fieldRows: unknown[][],
        itemRows: unknown[][] = [],
    ): { fields: ExcelJS.Worksheet; items: ExcelJS.Worksheet } {
        const wb = new ExcelJS.Workbook();
        const fields = wb.addWorksheet('fields');
        fields.addRow(FIELDS_HEADER);
        fieldRows.forEach(r => fields.addRow(r));
        const items = wb.addWorksheet('fieldsItems');
        items.addRow(ITEMS_HEADER);
        itemRows.forEach(r => items.addRow(r));
        return { fields, items };
    }

    beforeEach(() => {
        service = new ParseListFieldsService();
    });

    it('парсит строку поля по позициям колонок', () => {
        const { fields, items } = makeSheets([
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

        const result = service.getFieldsData(fields, items);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            name: 'Дата',
            appType: 'calling',
            type: 'datetime',
            code: 'event_date',
            bxFieldName: 'EVENT_DATE',
            order: 30,
            isNeedUpdate: true,
            isMultiple: false,
            list: [],
        });
    });

    it('isActive=false исключает поле из шаблона', () => {
        const { fields, items } = makeSheets([
            [
                'Дата',
                'calling',
                'datetime',
                'event_date',
                'EVENT_DATE',
                30,
                true,
                false,
            ],
            [
                'Название',
                'calling',
                'string',
                'event_title',
                'EVENT_TITLE',
                20,
                true,
                true,
            ],
        ]);

        const result = service.getFieldsData(fields, items);

        expect(result).toHaveLength(1);
        expect(result[0].code).toBe('event_title');
    });

    it('booleans в виде строк (включая ИСТИНА/ЛОЖЬ) корректно приводятся', () => {
        const { fields, items } = makeSheets([
            [
                'Дата',
                'calling',
                'datetime',
                'event_date',
                'EVENT_DATE',
                30,
                'ЛОЖЬ',
                'ИСТИНА',
            ],
            [
                'Автор',
                'calling',
                'employee',
                'author',
                'AUTHOR',
                40,
                'true',
                'ЛОЖЬ',
            ],
        ]);

        const result = service.getFieldsData(fields, items);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            code: 'event_date',
            isNeedUpdate: false,
        });
    });

    it('тип multiple → isMultiple=true', () => {
        const { fields, items } = makeSheets([
            [
                'Контакты',
                'presentation',
                'multiple',
                'pres_plan_contacts',
                'PRES_PLAN_CONTACTS',
                100,
                true,
                true,
            ],
        ]);

        const result = service.getFieldsData(fields, items);

        expect(result[0].isMultiple).toBe(true);
        expect(result[0].type).toBe('multiple');
    });

    it('enumeration собирает только активные неудалённые элементы своего field_code', () => {
        const { fields, items } = makeSheets(
            [
                [
                    'Тип События',
                    'calling',
                    'enumeration',
                    'event_type',
                    'EVENT_TYPE',
                    40,
                    true,
                    true,
                ],
            ],
            [
                ['Звонок', 'event_type', 'call', 'CALL', 20, 'N', true, true],
                [
                    'Удалённый',
                    'event_type',
                    'removed',
                    'REMOVED',
                    30,
                    'Y',
                    true,
                    true,
                ],
                [
                    'Неактивный',
                    'event_type',
                    'inactive',
                    'INACTIVE',
                    40,
                    'N',
                    false,
                    true,
                ],
                ['Чужой', 'other_field', 'other', 'OTHER', 50, 'N', true, true],
            ],
        );

        const result = service.getFieldsData(fields, items);

        expect(result[0].list).toEqual([
            {
                VALUE: 'Звонок',
                DEL: 'N',
                XML_ID: 'call',
                CODE: 'call',
                SORT: 20,
            },
        ]);
    });

    it('формульные ячейки {result} разворачиваются до значения', () => {
        const { fields, items } = makeSheets([
            [
                'Компания',
                'calling',
                'crm',
                'crm_company',
                { formula: 'UPPER(D2)', result: 'CRM_COMPANY' },
                20,
                true,
                true,
            ],
        ]);

        const result = service.getFieldsData(fields, items);

        expect(result[0].bxFieldName).toBe('CRM_COMPANY');
    });

    it('пустые строки без name/code пропускаются', () => {
        const { fields, items } = makeSheets([
            [null, null, null, null, null, null, null, null],
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

        const result = service.getFieldsData(fields, items);

        expect(result).toHaveLength(1);
    });
});
