import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ComplectDto } from '@app/konstructor/document-generate/dto/complect/complect.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    mergeComplects,
    mergeDocumentVariants,
    mergeTotals,
} from '../multi/lib/variants/merge-document-variants';
import { groupVariantsByContractType } from '../multi/lib/variants/with-variant';

/**
 * Слияние наборов в один документ — это деньги: суммы складываются, скидка
 * пересчитывается от сумм, а срок складывать нельзя.
 */
const total = (over: {
    name?: string;
    sum: number;
    current?: number;
    precent?: number;
    quantity?: number;
}): ProductRowDto =>
    ({
        name: over.name ?? 'Итого',
        price: {
            sum: over.sum,
            current: over.current ?? over.sum / 12,
            default: over.precent ? over.sum / over.precent : over.sum,
            month: 0,
            quantity: over.quantity ?? 12,
            discount: {
                precent: over.precent ?? 1,
                amount: 0,
                current: 'percent',
            },
            measure: {
                id: 1,
                code: 1,
                type: 1,
                name: 'мес.',
                contractNumber: 1,
            },
        },
        product: { contractCoefficient: 1 },
    }) as unknown as ProductRowDto;

const complect = (
    groupsName: string,
    codes: string[],
    checked = true,
): ComplectDto =>
    ({
        groupsName,
        type: 'infoblocks',
        value: codes.map(code => ({ code, name: code, checked, weight: 1 })),
    }) as unknown as ComplectDto;

const variant = (over: Partial<DocumentVariantDto>): DocumentVariantDto =>
    ({
        variantSmartId: 1,
        title: 'Вариант',
        contractType: CONTRACT_LTYPE.ABON,
        complect: [],
        rows: [],
        sets: { general: [], alternative: [] },
        total: total({ sum: 100 }),
        ...over,
    }) as DocumentVariantDto;

describe('mergeTotals', () => {
    it('суммы складываются', () => {
        const { total: merged } = mergeTotals([
            total({ sum: 1000, current: 100 }),
            total({ sum: 500, current: 50 }),
        ]);

        expect(merged.price.sum).toBe(1500);
        expect(merged.price.current).toBe(150);
    });

    it('скидка пересчитывается от сумм, а не берётся у первого', () => {
        // 800 при скидке 20% (база 1000) + 1000 без скидки (база 1000)
        const { total: merged } = mergeTotals([
            total({ sum: 800, precent: 0.8 }),
            total({ sum: 1000, precent: 1 }),
        ]);

        // 1800 / 2000
        expect(merged.price.discount.precent).toBe(0.9);
        expect(merged.price.default).toBe(2000);
    });

    it('срок не складывается: расхождение уходит в warnings, берётся первый', () => {
        const { total: merged, warnings } = mergeTotals([
            total({ sum: 100, quantity: 12 }),
            total({ name: 'Второй', sum: 100, quantity: 6 }),
        ]);

        expect(merged.price.quantity).toBe(12);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Второй');
    });

    it('один итог возвращается как есть', () => {
        const single = total({ sum: 42 });
        expect(mergeTotals([single]).total).toBe(single);
    });
});

describe('mergeComplects', () => {
    it('повторяющиеся инфоблоки схлопываются, порядок — первого появления', () => {
        const merged = mergeComplects([
            [complect('Право', ['npa', 'la'])],
            [complect('Право', ['la', 'c'])],
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0].value.map(item => item.code)).toEqual([
            'npa',
            'la',
            'c',
        ]);
    });

    it('инфоблок, выбранный хотя бы в одном наборе, выбран в общем', () => {
        const merged = mergeComplects([
            [complect('Право', ['npa'], false)],
            [complect('Право', ['npa'], true)],
        ]);

        expect(merged[0].value[0].checked).toBe(true);
    });

    it('разные группы не смешиваются', () => {
        const merged = mergeComplects([
            [complect('Право', ['npa'])],
            [complect('Энциклопедии', ['er'])],
        ]);

        expect(merged.map(group => group.groupsName)).toEqual([
            'Право',
            'Энциклопедии',
        ]);
    });
});

describe('mergeDocumentVariants', () => {
    it('строки и наборы идут подряд, заголовок собирается из участников', () => {
        const { variant: merged } = mergeDocumentVariants([
            variant({ title: 'Юрист', rows: [total({ sum: 1 })] }),
            variant({ title: 'Бухгалтер', rows: [total({ sum: 2 })] }),
        ]);

        expect(merged.rows).toHaveLength(2);
        expect(merged.title).toBe('Юрист + Бухгалтер');
        expect(merged.total.price.sum).toBe(200);
        // слитый документ — не элемент смарта
        expect(merged.variantSmartId).toBeNull();
    });
});

describe('groupVariantsByContractType', () => {
    it('группа на тип договора, порядок первого появления', () => {
        const groups = groupVariantsByContractType([
            variant({ title: 'a', contractType: CONTRACT_LTYPE.ABON }),
            variant({ title: 'b', contractType: CONTRACT_LTYPE.LIC }),
            variant({ title: 'c', contractType: CONTRACT_LTYPE.ABON }),
        ]);

        expect(groups.map(group => group.map(item => item.title))).toEqual([
            ['a', 'c'],
            ['b'],
        ]);
    });
});
