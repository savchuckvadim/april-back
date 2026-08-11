import {
    buildSkapItemDedupKey,
    buildSkapItemFieldName,
    buildSkapUfName,
    buildSkapXmlId,
    normalizeSkapLogin,
    SKAP_EVENT_CODES,
    SKAP_EVENT_ITEMS,
    SKAP_FIELD_CODES,
    SKAP_SMART_CODE,
    SKAP_SMART_FIELDS,
    SKAP_SMART_GROUP,
    SKAP_SMART_TYPE,
} from '../type/pbx-skap-smart.type';
import { buildSkapInstallFields } from '../type/pbx-skap-smart-field.type';
import { SKAP_SMART_DESCRIPTOR } from '../type/pbx-skap-smart.descriptor';

describe('SKAP_SMART_FIELDS (const-конфиг смарта)', () => {
    it('коды полей уникальны и совпадают с SKAP_FIELD_CODES', () => {
        const codes = SKAP_SMART_FIELDS.map(field => field.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect([...codes].sort()).toEqual([...SKAP_FIELD_CODES].sort());
    });

    it('у каждого crm-поля задан crmEntities (иначе значения молча теряются)', () => {
        for (const field of SKAP_SMART_FIELDS) {
            if (field.type === 'crm') {
                expect(field.crmEntities?.length).toBeGreaterThan(0);
            }
        }
    });

    it('у каждого enumeration-поля есть items с уникальными кодами', () => {
        for (const field of SKAP_SMART_FIELDS) {
            if (field.type === 'enumeration') {
                const items = field.items ?? [];
                expect(items.length).toBeGreaterThan(0);
                const codes = items.map(item => item.CODE);
                expect(new Set(codes).size).toBe(codes.length);
            }
        }
    });

    it('события месяца: items соответствуют кодам SKAP_EVENT_CODES', () => {
        expect(SKAP_EVENT_ITEMS.map(item => item.CODE).sort()).toEqual(
            [...SKAP_EVENT_CODES].sort(),
        );
    });
});

describe('buildSkapInstallFields (install-адаптер)', () => {
    it('отдаёт все поля конфига с порядком и списками', () => {
        const fields = buildSkapInstallFields();
        expect(fields.length).toBe(SKAP_SMART_FIELDS.length);
        for (const field of fields) {
            expect(field.order).toBeGreaterThan(0);
            expect(field.bxFieldName).toBe(field.code);
        }
        const events = fields.find(field => field.code === 'EVENTS');
        expect(events?.isMultiple).toBe(true);
        expect(events?.list.length).toBe(SKAP_EVENT_ITEMS.length);
        expect(events?.list[0]).toMatchObject({
            XML_ID: SKAP_EVENT_ITEMS[0].CODE,
        });
    });
});

describe('SKAP_SMART_DESCRIPTOR', () => {
    it('код по конвенции, поля без воронок', () => {
        expect(SKAP_SMART_DESCRIPTOR.code).toBe(
            `${SKAP_SMART_TYPE}_${SKAP_SMART_GROUP}`,
        );
        expect(SKAP_SMART_DESCRIPTOR.code).toBe(SKAP_SMART_CODE);
        expect(SKAP_SMART_DESCRIPTOR.hasCategories).toBe(false);
        expect(SKAP_SMART_DESCRIPTOR.fieldsCount).toBe(
            SKAP_SMART_FIELDS.length,
        );
    });
});

describe('хелперы имён и ключей', () => {
    it('buildSkapUfName / buildSkapItemFieldName', () => {
        expect(buildSkapUfName(13, 'PERIOD_CODE')).toBe(
            'UF_CRM_13_PERIOD_CODE',
        );
        expect(buildSkapItemFieldName(13, 'PERIOD_CODE')).toBe(
            'ufCrm13PeriodCode',
        );
        expect(buildSkapItemFieldName(94, 'IP_LIST')).toBe('ufCrm94IpList');
    });

    it('normalizeSkapLogin: trim + lowercase', () => {
        expect(normalizeSkapLogin('  User@Mail.RU ')).toBe('user@mail.ru');
    });

    it('xmlId и dedup-key детерминированы и нормализуют логин', () => {
        expect(
            buildSkapXmlId('61-40762-000004', ' Login@X.ru ', '2024-08'),
        ).toBe('skap_61-40762-000004_login@x.ru_2024-08');
        expect(
            buildSkapItemDedupKey(
                'april.bitrix24.ru',
                '61-40762-000004',
                'Login@X.ru',
                '2024-08',
            ),
        ).toBe('april.bitrix24.ru:61-40762-000004:login@x.ru:2024-08');
    });
});
