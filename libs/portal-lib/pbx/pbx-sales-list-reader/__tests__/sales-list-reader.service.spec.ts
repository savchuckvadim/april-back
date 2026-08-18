import { SalesListReaderService } from '../sales-list-reader.service';
import { renderSalesListRecordLine } from '../type/sales-list-record.type';

/** Слепок списка sales_kpi с полями по канону kpi-report. */
const makeList = () => ({
    group: 'sales',
    type: 'kpi',
    bitrixId: '10',
    title: 'ОП KPI',
    name: 'op_kpi',
    bitrixfields: [
        {
            code: 'sales_kpi_event_date',
            name: 'Дата события',
            bitrixId: 'PROPERTY_1',
            bitrixCamelId: 'PROPERTY_1',
            items: [],
        },
        {
            code: 'sales_kpi_event_type',
            name: 'Тип события',
            bitrixId: 'PROPERTY_2',
            bitrixCamelId: 'PROPERTY_2',
            items: [
                {
                    code: 'sales_kpi_presentation',
                    name: 'Презентация',
                    bitrixId: 201,
                },
                { code: 'sales_kpi_xo', name: 'ХО', bitrixId: 202 },
            ],
        },
        {
            code: 'sales_kpi_event_action',
            name: 'Действие',
            bitrixId: 'PROPERTY_3',
            bitrixCamelId: 'PROPERTY_3',
            items: [
                { code: 'sales_kpi_done', name: 'Проведено', bitrixId: 301 },
            ],
        },
        {
            code: 'sales_kpi_responsible',
            name: 'Ответственный',
            bitrixId: 'PROPERTY_4',
            bitrixCamelId: 'PROPERTY_4',
            items: [],
        },
        {
            code: 'sales_kpi_crm',
            name: 'CRM',
            bitrixId: 'PROPERTY_5',
            bitrixCamelId: 'PROPERTY_5',
            items: [],
        },
        {
            code: 'sales_kpi_manager_comment',
            name: 'Комментарий менеджера',
            bitrixId: 'PROPERTY_6',
            bitrixCamelId: 'PROPERTY_6',
            items: [],
        },
        {
            code: 'sales_kpi_op_work_status',
            name: 'Статус работы',
            bitrixId: 'PROPERTY_7',
            bitrixCamelId: 'PROPERTY_7',
            items: [
                {
                    code: 'sales_kpi_op_status_in_work',
                    name: 'В работе',
                    bitrixId: 701,
                },
            ],
        },
    ],
});

const ITEM = {
    ID: 9001,
    NAME: 'Презентация Проведено. ООО Ромашка',
    DATE_CREATE: '2026-08-15T18:00:00Z',
    PROPERTY_1: { 11: '14.08.2026' },
    PROPERTY_2: { 12: 201 },
    PROPERTY_3: { 13: 301 },
    PROPERTY_4: { 14: 187 },
    PROPERTY_5: { 15: 'D_601' },
    PROPERTY_6: { 16: 'Показал Искру, обещали обсудить с директором' },
    PROPERTY_7: { 17: 701 },
};

const makeDeps = (options?: {
    items?: Record<string, unknown>[];
    listMissing?: boolean;
    apiError?: boolean;
    dropEventDateField?: boolean;
}) => {
    const list = makeList();
    if (options?.dropEventDateField) {
        list.bitrixfields = list.bitrixfields.filter(
            field => field.code !== 'sales_kpi_event_date',
        );
    }
    const get = options?.apiError
        ? jest.fn().mockRejectedValue(new Error('bitrix down'))
        : jest.fn().mockResolvedValue({ result: options?.items ?? [ITEM] });
    const bitrix = { listItem: { get } };
    const portal = {
        getListByCode: jest.fn(() => (options?.listMissing ? undefined : list)),
        // Реальная семантика PortalModel: полный код = {group}_{type}_{code}.
        getIdByCodeFieldList: jest.fn(
            (targetList: { group: string; type: string }, code: string) =>
                list.bitrixfields.find(
                    field =>
                        field.code ===
                        `${targetList.group}_${targetList.type}_${code}`,
                ),
        ),
    };
    const service = new SalesListReaderService(
        bitrix as never,
        portal as never,
    );
    return { service, get, portal };
};

describe('SalesListReaderService («робот» списков отчётности)', () => {
    it('фильтры по канону kpi-report: crm-ссылки, тип события по bitrixId элемента, даты по полю события, ответственный', async () => {
        const { service, get } = makeDeps();
        await service.read('sales_kpi', {
            crmRefs: ['D_601', 'CO_33'],
            eventTypeCodes: ['presentation'],
            dateFrom: new Date('2026-08-11T00:00:00Z'),
            dateTo: new Date('2026-08-17T00:00:00Z'),
            responsibleId: 187,
        });

        expect(get).toHaveBeenCalledWith({
            IBLOCK_ID: '10',
            filter: {
                PROPERTY_5: ['D_601', 'CO_33'],
                // Значение выпадающего списка — bitrixId элемента, не код.
                PROPERTY_2: [201],
                '>PROPERTY_1': '2026-08-11',
                '<PROPERTY_1': '2026-08-17',
                PROPERTY_4: '187',
            },
        });
    });

    it('запись резолвится: тип/действие из выпадающих списков, дата события, комментарий и статус по имени элемента', async () => {
        const { service } = makeDeps();
        const [record] = await service.read('sales_kpi', {});

        expect(record.id).toBe('9001');
        expect(record.eventDate).toBe('14.08.2026');
        expect(record.eventTypeCode).toBe('presentation');
        expect(record.eventTypeName).toBe('Презентация');
        expect(record.eventActionName).toBe('Проведено');
        expect(record.responsibleId).toBe('187');
        expect(record.crmRefs).toEqual(['D_601']);
        // Содержательные поля: комментарий текстом, enum-статус — именем.
        expect(record.fields).toEqual([
            {
                code: 'manager_comment',
                name: 'Комментарий менеджера',
                value: 'Показал Искру, обещали обсудить с директором',
            },
            {
                code: 'op_work_status',
                name: 'Статус работы',
                value: 'В работе',
            },
        ]);
        const line = renderSalesListRecordLine(record);
        expect(line).toContain('id=9001');
        expect(line).toContain('тип: Презентация');
        expect(line).toContain('Показал Искру');
    });

    it('нет поля даты события — окно фильтруется по DATE_CREATE', async () => {
        const { service, get } = makeDeps({ dropEventDateField: true });
        await service.read('sales_kpi', {
            dateFrom: new Date('2026-08-11T00:00:00Z'),
        });
        const filter = (
            get.mock.calls[0] as [{ filter: Record<string, unknown> }]
        )[0].filter;
        expect(filter['>=DATE_CREATE']).toBe('2026-08-11T00:00:00.000Z');
    });

    it('пост-фильтр: запись с резолвленным чужим типом события отсекается', async () => {
        const { service } = makeDeps({
            items: [ITEM, { ...ITEM, ID: 9002, PROPERTY_2: { 12: 202 } }],
        });
        const records = await service.read('sales_kpi', {
            eventTypeCodes: ['presentation'],
        });
        expect(records.map(record => record.id)).toEqual(['9001']);
    });

    it('список не настроен или Bitrix упал — пустой массив без исключений', async () => {
        const missing = makeDeps({ listMissing: true });
        expect(await missing.service.read('sales_kpi', {})).toEqual([]);
        const broken = makeDeps({ apiError: true });
        expect(await broken.service.read('sales_kpi', {})).toEqual([]);
    });
});
