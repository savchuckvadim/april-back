import {
    mapListElementToRecord,
    normalizeBitrixDateTime,
    scalarsOf,
} from '../lib/digest-record.mapper';
import {
    digestSelectFields,
    resolveDigestListFields,
    DigestListConfigError,
} from '../lib/digest-list-fields.util';
import { listElement, portalModelMock } from './digest-list-fields.fixture';

describe('resolveDigestListFields', () => {
    it('резолвит поля, items без префикса списка и каталог с группами', () => {
        const fields = resolveDigestListFields(portalModelMock() as never);

        expect(fields.listId).toBe('55');
        expect(fields.eventType.filterKey).toBe('PROPERTY_101');
        expect(fields.eventType.valueKeys).toEqual(['PROPERTY_101', '101']);
        expect(fields.itemsByValue.eventType.get('23')).toEqual({
            code: 'presentation',
            name: 'Презентация',
            bitrixId: '23',
        });
        expect(fields.actionItemsByCode.get('pound')?.bitrixId).toBe('12');
        expect(fields.catalog.types.find(t => t.code === 'xo')?.group).toBe('call');
        expect(fields.catalog.types.find(t => t.code === 'ev_offer')?.group).toBe('document');
        expect(fields.catalog.noresultReasons).toEqual([
            { code: 'nopickup', name: 'Не берут трубку' },
            { code: 'secretar', name: 'Секретарь' },
        ]);
        expect(digestSelectFields(fields)).toEqual([
            'ID',
            'NAME',
            'DATE_CREATE',
            'PROPERTY_101',
            'PROPERTY_100',
            'PROPERTY_103',
            'PROPERTY_102',
            'PROPERTY_104',
            'PROPERTY_105',
            'PROPERTY_106',
            'PROPERTY_107',
            'PROPERTY_108',
            'PROPERTY_109',
        ]);
    });

    it('без списка или обязательного поля — DigestListConfigError', () => {
        expect(() =>
            resolveDigestListFields({ getListByCode: () => undefined } as never),
        ).toThrow(DigestListConfigError);
        expect(() =>
            resolveDigestListFields({
                getListByCode: () => ({
                    group: 'sales',
                    type: 'kpi',
                    bitrixId: '55',
                    bitrixfields: [],
                }),
            } as never),
        ).toThrow(DigestListConfigError);
    });
});

describe('normalizeBitrixDateTime', () => {
    it('легаси, дата без времени и ISO с зоной — в YYYY-MM-DD HH:mm:ss без пересчёта', () => {
        expect(normalizeBitrixDateTime('14.10.2026 10:15:07')).toBe('2026-10-14 10:15:07');
        expect(normalizeBitrixDateTime('14.10.2026')).toBe('2026-10-14 00:00:00');
        expect(normalizeBitrixDateTime('2026-10-14T18:30:00+03:00')).toBe('2026-10-14 18:30:00');
        expect(normalizeBitrixDateTime('2026-10-14 09:05:00')).toBe('2026-10-14 09:05:00');
        expect(normalizeBitrixDateTime('')).toBeNull();
        expect(normalizeBitrixDateTime('вчера')).toBeNull();
    });
});

describe('mapListElementToRecord', () => {
    const fields = resolveDigestListFields(portalModelMock() as never);

    it('вынимает скаляры из {id: value}-объектов и резолвит справочники', () => {
        const record = mapListElementToRecord(
            listElement({
                id: 7,
                userId: 42,
                type: 23,
                action: 14,
                eventDate: '14.10.2026 11:00:00',
                planDate: '16.10.2026 12:00:00',
                result: 32,
                reason: 41,
                comment: 'Перезвонить',
                crm: ['CO_15', 'D_1024'],
                company: 'CO_15',
            }),
            fields,
        );

        expect(record).toEqual({
            id: '7',
            userId: 42,
            typeCode: 'presentation',
            typeName: 'Презентация',
            actionCode: 'act_noresult_fail',
            actionName: 'Не состоялся',
            eventDate: '2026-10-14 11:00:00',
            planDate: '2026-10-16 12:00:00',
            resultCode: 'op_call_result_no',
            noresultReason: 'nopickup',
            comment: 'Перезвонить',
            name: 'Событие 7',
            crmRefs: ['CO_15', 'D_1024'],
            companyId: 15,
        });
    });

    it('неизвестные значения → null, комментарий обрезается, компания из CRM-ссылок', () => {
        const element = listElement({
            id: 8,
            userId: 42,
            type: 999,
            action: 13,
            eventDate: '14.10.2026 11:00:00',
            comment: 'a'.repeat(500),
            crm: ['D_1', 'CO_77'],
        });
        const record = mapListElementToRecord(element, fields, 10);

        expect(record.typeCode).toBeNull();
        expect(record.actionCode).toBe('done');
        expect(record.planDate).toBeNull();
        expect(record.resultCode).toBeNull();
        expect(record.comment).toBe(`${'a'.repeat(10)}…`);
        expect(record.companyId).toBe(77);
    });

    it('scalarsOf: массивы, объекты и пустые значения', () => {
        expect(scalarsOf({ a: '1', b: ['2', { c: 3 }] })).toEqual(['1', '2', '3']);
        expect(scalarsOf('  ')).toEqual([]);
        expect(scalarsOf(null)).toEqual([]);
    });
});
