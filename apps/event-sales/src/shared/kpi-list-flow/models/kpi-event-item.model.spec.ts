import { IPBXList } from '@lib/portal/interfaces/portal.interface';
import { KpiEventItemModel } from './kpi-event-item.model';
import { KpiEventPayload } from '../type/kpi-event-payload.type';

const buildList = (group: string, type: string): IPBXList => ({
    group,
    type,
    bitrixId: '42',
    title: 'List',
    name: 'list',
    bitrixfields: [
        {
            type: 'datetime',
            code: `${group}_${type}_event_date`,
            name: 'Дата',
            title: 'Дата',
            bitrixId: 'PROPERTY_1',
            bitrixCamelId: 'PROPERTY_1',
            items: [],
        },
        {
            type: 'string',
            code: `${group}_${type}_event_title`,
            name: 'Название',
            title: 'Название',
            bitrixId: 'PROPERTY_2',
            bitrixCamelId: 'PROPERTY_2',
            items: [],
        },
        {
            type: 'employee',
            code: `${group}_${type}_responsible`,
            name: 'Отв.',
            title: 'Отв.',
            bitrixId: 'PROPERTY_3',
            bitrixCamelId: 'PROPERTY_3',
            items: [],
        },
        {
            type: 'enumeration',
            code: `${group}_${type}_event_type`,
            name: 'Тип',
            title: 'Тип',
            bitrixId: 'PROPERTY_4',
            bitrixCamelId: 'PROPERTY_4',
            items: [
                {
                    id: 1,
                    created_at: new Date(),
                    updated_at: new Date(),
                    bitrixfield_id: 4,
                    name: 'xo',
                    title: 'xo',
                    code: 'xo',
                    bitrixId: 4001,
                },
                {
                    id: 2,
                    created_at: new Date(),
                    updated_at: new Date(),
                    bitrixfield_id: 4,
                    name: 'call',
                    title: 'call',
                    code: 'call',
                    bitrixId: 4002,
                },
            ],
        },
    ],
});

const basePayload: KpiEventPayload = {
    name: 'Холодный звонок Запланирован',
    values: {
        event_date: '01.04.2026 10:00:00',
        event_title: 'Холодный звонок Запланирован',
        responsible: 42,
    },
    items: {
        event_type: 'xo',
    },
};

describe('KpiEventItemModel', () => {
    it('всегда выставляет NAME из payload', () => {
        const list = buildList('sales', 'kpi');
        const fields = new KpiEventItemModel(list, basePayload).toFields();
        expect(fields.NAME).toBe('Холодный звонок Запланирован');
    });

    it('маппит скалярные значения через bitrixCamelId по префиксу группы/типа', () => {
        const list = buildList('sales', 'kpi');
        const fields = new KpiEventItemModel(list, basePayload).toFields();

        expect(fields.PROPERTY_1).toBe('01.04.2026 10:00:00'); // event_date
        expect(fields.PROPERTY_2).toBe('Холодный звонок Запланирован'); // event_title
        expect(fields.PROPERTY_3).toBe(42); // responsible
    });

    it('маппит item-коды enum-полей в bitrixId соответствующего item', () => {
        const list = buildList('sales', 'kpi');
        const fields = new KpiEventItemModel(list, basePayload).toFields();
        expect(fields.PROPERTY_4).toBe(4001); // event_type=xo
    });

    it('пропускает поле, которого нет на портале', () => {
        const list = buildList('sales', 'kpi');
        const payload: KpiEventPayload = {
            ...basePayload,
            values: { ...basePayload.values, manager_comment: 'hi' },
        };
        const fields = new KpiEventItemModel(list, payload).toFields();
        expect(fields).not.toHaveProperty('manager_comment');
    });

    it('пропускает item-код, которого нет в items поля', () => {
        const list = buildList('sales', 'kpi');
        // Cast через unknown — на TS-уровне unknown_code не входит в union
        // PbxSalesKpiListFieldItemCode<'event_type'>, но runtime защита всё
        // равно нужна (на портале может появиться устаревший item-код).
        const payload: KpiEventPayload = {
            ...basePayload,
            items: {
                event_type:
                    'unknown_code' as unknown as KpiEventPayload['items']['event_type'],
            },
        };
        const fields = new KpiEventItemModel(list, payload).toFields();
        expect(fields).not.toHaveProperty('PROPERTY_4');
    });

    it('пропускает undefined / null скаляры', () => {
        const list = buildList('sales', 'kpi');
        const payload: KpiEventPayload = {
            name: 'X',
            values: { event_date: undefined, plan_date: null },
            items: {},
        };
        const fields = new KpiEventItemModel(list, payload).toFields();
        expect(fields).not.toHaveProperty('PROPERTY_1');
        expect(Object.keys(fields)).toEqual(['NAME']);
    });

    it('использует префикс группы/типа списка — sales_history маппится отдельно', () => {
        const historyList = buildList('sales', 'history');
        // подменим коды на history-префиксные
        const fields = new KpiEventItemModel(
            historyList,
            basePayload,
        ).toFields();

        expect(fields.PROPERTY_1).toBe('01.04.2026 10:00:00');
        expect(fields.PROPERTY_4).toBe(4001);
    });

    it('возвращает только NAME, если у списка нет bitrixfields', () => {
        const list: IPBXList = {
            group: 'sales',
            type: 'kpi',
            bitrixId: '1',
            title: 't',
            name: 'n',
        };
        const fields = new KpiEventItemModel(list, basePayload).toFields();
        expect(fields).toEqual({ NAME: 'Холодный звонок Запланирован' });
    });
});
