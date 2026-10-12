import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import { DocumentTemplateKind } from '../document-template.criteria';
import { TemplateDefaultRow } from '../document-template.repository';
import {
    findAmbiguousBuckets,
    findKindsRelyingOnCommon,
} from '../lib/ambiguity.util';

const row = (
    over: Partial<TemplateDefaultRow> & { id: string },
): TemplateDefaultRow => ({
    kind: DocumentTemplateKind.CONTRACT,
    portalId: BigInt(7),
    agentId: null,
    contractType: CONTRACT_LTYPE.ABON,
    clientTypes: null,
    supplyTypes: null,
    ...over,
});

describe('findAmbiguousBuckets', () => {
    it('пустой вход — пустой результат', () => {
        expect(findAmbiguousBuckets([])).toEqual([]);
    });

    it('одна строка «по умолчанию» в ящике — не конфликт', () => {
        expect(findAmbiguousBuckets([row({ id: '1' })])).toEqual([]);
    });

    it('две строки с одинаковыми признаками — конфликт', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1' }),
            row({ id: '2' }),
        ]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0].defaultCount).toBe(2);
        expect(buckets[0].templateIds).toEqual(['1', '2']);
        expect(buckets[0].portalId).toBe('7');
        expect(buckets[0].isCommon).toBe(false);
    });

    it('разный тип договора — РАЗНЫЕ ящики, конфликта нет', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', contractType: CONTRACT_LTYPE.ABON }),
            row({ id: '2', contractType: CONTRACT_LTYPE.LIC }),
        ]);

        expect(buckets).toEqual([]);
    });

    it('разный портал — разные ящики', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', portalId: BigInt(7) }),
            row({ id: '2', portalId: BigInt(8) }),
        ]);

        expect(buckets).toEqual([]);
    });

    it('разный поставщик — разные ящики', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', agentId: BigInt(42) }),
            row({ id: '2', agentId: null }),
        ]);

        expect(buckets).toEqual([]);
    });

    it('разный вид документа не смешивается в один ящик', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', kind: DocumentTemplateKind.SUPPLY_REPORT }),
            row({ id: '2', kind: DocumentTemplateKind.INVOICE }),
        ]);

        expect(buckets).toEqual([]);
    });

    it('порядок кодов в списке не создаёт ложно разных ящиков', () => {
        // Главное в группировке: ["org","ip"] и ["ip","org"] — это ОДИН
        // и тот же набор признаков отбора, иначе конфликт не заметить.
        const buckets = findAmbiguousBuckets([
            row({ id: '1', clientTypes: '["org","ip"]' }),
            row({ id: '2', clientTypes: '["ip","org"]' }),
        ]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0].clientTypes).toEqual([
            ClientTypeEnum.IP,
            ClientTypeEnum.ORG,
        ]);
    });

    it('null, пустая строка и "[]" — всё это «для любого», один ящик', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', clientTypes: null }),
            row({ id: '2', clientTypes: '' }),
            row({ id: '3', clientTypes: '[]' }),
        ]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0].defaultCount).toBe(3);
        expect(buckets[0].clientTypes).toBeNull();
    });

    it('битый JSON не ронял разбор и попадает в ящик «для любого»', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', clientTypes: '{не json' }),
            row({ id: '2', clientTypes: null }),
        ]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0].clientTypes).toBeNull();
    });

    it('разный тип поставки — разные ящики', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', supplyTypes: '["internet"]' }),
            row({ id: '2', supplyTypes: '["proxima"]' }),
        ]);

        expect(buckets).toEqual([]);
    });

    it('совпадающий тип поставки — конфликт, список нормализован', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', supplyTypes: '["internet"]' }),
            row({ id: '2', supplyTypes: '["internet"]' }),
        ]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0].supplyTypes).toEqual([SupplyTypeEnum.INTERNET]);
    });

    it('общий ящик помечен isCommon и идёт первым', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1', portalId: BigInt(7) }),
            row({ id: '2', portalId: BigInt(7) }),
            row({ id: '3', portalId: null }),
            row({ id: '4', portalId: null }),
        ]);

        expect(buckets).toHaveLength(2);
        expect(buckets[0].isCommon).toBe(true);
        expect(buckets[0].portalId).toBeNull();
        expect(buckets[1].isCommon).toBe(false);
    });

    it('id в ящике отсортированы — ответ стабилен между вызовами', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '42' }),
            row({ id: '17' }),
        ]);

        expect(buckets[0].templateIds).toEqual(['17', '42']);
    });

    it('uuid-id счёта группируется так же, как bigint', () => {
        const buckets = findAmbiguousBuckets([
            row({
                id: 'aaaaaaaa-0000-4000-8000-000000000001',
                kind: DocumentTemplateKind.INVOICE,
                contractType: null,
            }),
            row({
                id: 'aaaaaaaa-0000-4000-8000-000000000002',
                kind: DocumentTemplateKind.INVOICE,
                contractType: null,
            }),
        ]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0].kind).toBe(DocumentTemplateKind.INVOICE);
        expect(buckets[0].contractType).toBeNull();
    });

    it('три строки в одном ящике — defaultCount 3', () => {
        const buckets = findAmbiguousBuckets([
            row({ id: '1' }),
            row({ id: '2' }),
            row({ id: '3' }),
        ]);

        expect(buckets[0].defaultCount).toBe(3);
    });
});

describe('findKindsRelyingOnCommon', () => {
    it('у портала нет своих строк — все три вида на общих', () => {
        expect(findKindsRelyingOnCommon([])).toEqual([
            DocumentTemplateKind.CONTRACT,
            DocumentTemplateKind.SUPPLY_REPORT,
            DocumentTemplateKind.INVOICE,
        ]);
    });

    it('есть свои договоры — остаются отчёт и счёт', () => {
        expect(
            findKindsRelyingOnCommon([DocumentTemplateKind.CONTRACT]),
        ).toEqual([
            DocumentTemplateKind.SUPPLY_REPORT,
            DocumentTemplateKind.INVOICE,
        ]);
    });

    it('все три вида свои — пусто', () => {
        expect(
            findKindsRelyingOnCommon([
                DocumentTemplateKind.CONTRACT,
                DocumentTemplateKind.SUPPLY_REPORT,
                DocumentTemplateKind.INVOICE,
            ]),
        ).toEqual([]);
    });

    it('КП в расчёт не входит — он вне общего резолвера', () => {
        expect(
            findKindsRelyingOnCommon([DocumentTemplateKind.OFFER_WORD]),
        ).not.toContain(DocumentTemplateKind.OFFER_WORD);
    });
});
