import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    listMatches,
    parseClientTypes,
    parseSupplyTypes,
    parseTemplateListStrict,
    serializeTemplateList,
} from '../lib/template-lists.util';

describe('parseClientTypes', () => {
    it('читает валидный список', () => {
        expect(parseClientTypes('["org","ip"]')).toEqual([
            ClientTypeEnum.ORG,
            ClientTypeEnum.IP,
        ]);
    });

    it('читает advokat — задел на будущее уже в справочнике', () => {
        expect(parseClientTypes('["advokat"]')).toEqual([
            ClientTypeEnum.ADVOKAT,
        ]);
    });

    it('NULL и пустая строка — «годится любому»', () => {
        expect(parseClientTypes(null)).toBeNull();
        expect(parseClientTypes(undefined)).toBeNull();
        expect(parseClientTypes('')).toBeNull();
        expect(parseClientTypes('   ')).toBeNull();
    });

    it('пустой массив приравнен к NULL, а не к «никому не подходит»', () => {
        expect(parseClientTypes('[]')).toBeNull();
    });

    it('битый JSON не кидает, а сводится к NULL', () => {
        expect(parseClientTypes('{не json')).toBeNull();
        expect(parseClientTypes('["org"')).toBeNull();
    });

    it('не-массив сводится к NULL', () => {
        expect(parseClientTypes('"org"')).toBeNull();
        expect(parseClientTypes('{"a":1}')).toBeNull();
        expect(parseClientTypes('42')).toBeNull();
    });

    it('незнакомые коды отбрасываются, знакомые остаются', () => {
        expect(parseClientTypes('["org","нечто","fiz"]')).toEqual([
            ClientTypeEnum.ORG,
            ClientTypeEnum.FIZ,
        ]);
    });

    it('список из одних незнакомых кодов — NULL (fail-open, см. докблок)', () => {
        expect(parseClientTypes('["нечто","ещё"]')).toBeNull();
    });

    it('дубли убираются', () => {
        expect(parseClientTypes('["org","org","ip"]')).toEqual([
            ClientTypeEnum.ORG,
            ClientTypeEnum.IP,
        ]);
    });

    it('элементы не-строки игнорируются', () => {
        expect(parseClientTypes('["org",1,null,true,{}]')).toEqual([
            ClientTypeEnum.ORG,
        ]);
    });
});

describe('parseSupplyTypes', () => {
    it('читает internet и proxima', () => {
        expect(parseSupplyTypes('["internet","proxima"]')).toEqual([
            SupplyTypeEnum.INTERNET,
            SupplyTypeEnum.PROXIMA,
        ]);
    });

    it('не путает справочники: тип клиента в поле типа поставки отбрасывается', () => {
        expect(parseSupplyTypes('["org"]')).toBeNull();
    });
});

describe('parseTemplateListStrict', () => {
    const allowed = Object.values(ClientTypeEnum);

    it('сообщает, что ничего не отброшено', () => {
        expect(parseTemplateListStrict('["org"]', allowed)).toEqual({
            list: [ClientTypeEnum.ORG],
            dropped: false,
        });
    });

    it('сообщает об отбрасывании — вызывающий обязан залогировать fail-open', () => {
        expect(parseTemplateListStrict('["org","нечто"]', allowed)).toEqual({
            list: [ClientTypeEnum.ORG],
            dropped: true,
        });
    });

    it('полностью незнакомый список: dropped=true и list=null', () => {
        expect(parseTemplateListStrict('["нечто"]', allowed)).toEqual({
            list: null,
            dropped: true,
        });
    });

    it('NULL — это не отбрасывание, а «не настроено»', () => {
        expect(parseTemplateListStrict(null, allowed)).toEqual({
            list: null,
            dropped: false,
        });
    });
});

describe('serializeTemplateList', () => {
    it('пишет JSON-массив', () => {
        expect(serializeTemplateList([ClientTypeEnum.ORG])).toBe('["org"]');
    });

    it('пустой список и undefined пишутся как NULL, а не "[]"', () => {
        expect(serializeTemplateList([])).toBeNull();
        expect(serializeTemplateList(null)).toBeNull();
        expect(serializeTemplateList(undefined)).toBeNull();
    });

    it('дубли убираются при записи', () => {
        expect(serializeTemplateList(['org', 'org'])).toBe('["org"]');
    });

    it('round-trip сохраняет список', () => {
        const list = [ClientTypeEnum.ORG, ClientTypeEnum.ADVOKAT];
        expect(parseClientTypes(serializeTemplateList(list))).toEqual(list);
    });
});

describe('listMatches', () => {
    it('NULL подходит любому значению и даже отсутствию значения', () => {
        expect(listMatches(null, ClientTypeEnum.ORG)).toBe(true);
        expect(listMatches(null, null)).toBe(true);
        expect(listMatches(null, undefined)).toBe(true);
    });

    it('конкретный список подходит только своему значению', () => {
        const list = [ClientTypeEnum.ORG];
        expect(listMatches(list, ClientTypeEnum.ORG)).toBe(true);
        expect(listMatches(list, ClientTypeEnum.FIZ)).toBe(false);
    });

    it('конкретный список НЕ подходит, если значение не передано', () => {
        expect(listMatches([ClientTypeEnum.ORG], null)).toBe(false);
        expect(listMatches([ClientTypeEnum.ORG], undefined)).toBe(false);
    });
});
