import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import {
    RowDiscountDto,
    RowPriceDto,
} from '@app/konstructor/document-generate/dto/product-row/product-row-price.dto';
import {
    ProductRowSetDto,
    ProductRowSetItemDto,
} from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import { mergeGeneralSets } from '../multi/lib/variants/merge-general-sets';

/**
 * Один договор — один счёт: основные наборы сводятся в один набор. Строки
 * идут подряд, итоги складываются — это деньги в счёте.
 */
const row = (name: string): ProductRowDto =>
    Object.assign(new ProductRowDto(), { name });

const total = (sum: number, quantity = 12, name = 'Итого'): ProductRowDto =>
    Object.assign(new ProductRowDto(), {
        name,
        price: Object.assign(new RowPriceDto(), {
            sum,
            current: sum / 12,
            default: sum,
            month: 0,
            quantity,
            discount: Object.assign(new RowDiscountDto(), {
                precent: 1,
                amount: 0,
                current: 'percent',
            }),
        }),
    });

const set = (
    id: number,
    rows: ProductRowSetItemDto,
    totals: ProductRowDto[] = [],
): ProductRowSetDto =>
    Object.assign(new ProductRowSetDto(), {
        id,
        show: true,
        rows,
        total: totals,
    });

const names = (rows: ProductRowDto[] | undefined): string[] =>
    (rows ?? []).map(item => item.name);

describe('mergeGeneralSets', () => {
    it('строки всех наборов идут подряд по типам продукта', () => {
        const { set: merged } = mergeGeneralSets([
            set(1, {
                garant: [row('g1')],
                lt: [row('lt1')],
                consalting: [row('c1')],
            }),
            set(2, {
                garant: [row('g2'), row('g3')],
                lt: [row('lt2')],
                star: [row('s1')],
            }),
        ]);

        expect(names(merged?.rows.garant)).toEqual(['g1', 'g2', 'g3']);
        expect(names(merged?.rows.lt)).toEqual(['lt1', 'lt2']);
        expect(names(merged?.rows.consalting)).toEqual(['c1']);
        expect(names(merged?.rows.star)).toEqual(['s1']);
    });

    it('все шесть типов продукта сводятся, порядок типов фиксирован', () => {
        const everyType = (prefix: string): ProductRowSetItemDto => ({
            academy: [row(`${prefix}-academy`)],
            star: [row(`${prefix}-star`)],
            consalting: [row(`${prefix}-consalting`)],
            lt_other: [row(`${prefix}-lt_other`)],
            lt: [row(`${prefix}-lt`)],
            garant: [row(`${prefix}-garant`)],
        });

        const { set: merged } = mergeGeneralSets([
            set(1, everyType('a')),
            set(2, everyType('b')),
        ]);

        expect(Object.keys(merged?.rows ?? {})).toEqual([
            'garant',
            'lt',
            'lt_other',
            'consalting',
            'star',
            'academy',
        ]);
        expect(names(merged?.rows.academy)).toEqual(['a-academy', 'b-academy']);
        expect(names(merged?.rows.lt_other)).toEqual([
            'a-lt_other',
            'b-lt_other',
        ]);
    });

    it('итог набора — одна строка, сумма итогов наборов', () => {
        const { set: merged } = mergeGeneralSets([
            set(1, { garant: [row('g1')] }, [total(1000)]),
            set(2, { garant: [row('g2')] }, [total(500)]),
        ]);

        expect(merged?.total).toHaveLength(1);
        expect(merged?.total[0].price.sum).toBe(1500);
        expect(merged?.total[0].price.current).toBe(125);
    });

    it('сведённый набор получает id 0 и show false', () => {
        const { set: merged } = mergeGeneralSets([
            set(7, { garant: [row('g1')] }, [total(1)]),
            set(8, { garant: [row('g2')] }, [total(1)]),
        ]);

        expect(merged?.id).toBe(0);
        expect(merged?.show).toBe(false);
    });

    it('пустой и отсутствующий тип продукта в результат не попадает', () => {
        const { set: merged } = mergeGeneralSets([
            set(1, { garant: [row('g1')], lt: [], academy: undefined }),
            set(2, {}),
            // у набора нет ни rows, ни total
            Object.assign(new ProductRowSetDto(), { id: 4, show: true }),
            set(3, { garant: [row('g2')], star: [] }),
        ]);

        expect(Object.keys(merged?.rows ?? {})).toEqual(['garant']);
        expect(names(merged?.rows.garant)).toEqual(['g1', 'g2']);
    });

    it('у наборов нет ни одной строки — набор остаётся, строк в нём нет', () => {
        const { set: merged } = mergeGeneralSets([
            set(1, {}, [total(10)]),
            set(2, { garant: [] }, [total(20)]),
        ]);

        expect(merged?.rows).toEqual({});
        expect(merged?.total[0].price.sum).toBe(30);
    });

    it('набор без итога в сумму не входит, итогов нет вовсе — total пуст', () => {
        const withOneTotal = mergeGeneralSets([
            set(1, { garant: [row('g1')] }, [total(400)]),
            set(2, { garant: [row('g2')] }),
        ]);
        expect(withOneTotal.set?.total).toHaveLength(1);
        expect(withOneTotal.set?.total[0].price.sum).toBe(400);

        const noTotals = mergeGeneralSets([
            set(1, { garant: [row('g1')] }),
            set(2, { garant: [row('g2')] }),
        ]);
        expect(noTotals.set?.total).toEqual([]);
        expect(names(noTotals.set?.rows.garant)).toEqual(['g1', 'g2']);
    });

    it('срок не складывается: расхождение уходит в warnings, берётся первый', () => {
        const { set: merged, warnings } = mergeGeneralSets([
            set(1, { garant: [row('g1')] }, [total(100, 12)]),
            set(2, { garant: [row('g2')] }, [total(100, 6, 'Второй')]),
        ]);

        expect(merged?.total[0].price.quantity).toBe(12);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Второй');
    });

    it('один набор возвращается равным исходному по содержанию', () => {
        const single = set(7, { garant: [row('g1')], lt: [row('lt1')] }, [
            total(42),
        ]);

        const { set: merged, warnings } = mergeGeneralSets([single]);

        expect(merged).toEqual(single);
        expect(merged?.id).toBe(7);
        expect(merged?.show).toBe(true);
        expect(warnings).toEqual([]);
    });

    it('наборов нет — набора нет', () => {
        expect(mergeGeneralSets([])).toEqual({ set: null, warnings: [] });
    });

    it('исходные наборы не меняются', () => {
        const first = set(1, { garant: [row('g1')] }, [total(100)]);
        const second = set(2, { garant: [row('g2')] }, [total(200)]);
        const before = JSON.stringify([first, second]);

        mergeGeneralSets([first, second]);

        expect(JSON.stringify([first, second])).toBe(before);
    });
});
