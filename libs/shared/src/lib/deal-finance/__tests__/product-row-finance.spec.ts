import {
    rowMonthlyAmount,
    rowTotalAmount,
    sumRowsMonthly,
    sumRowsMonths,
    sumRowsTotal,
} from '../product-row-finance';

describe('product-row-finance', () => {
    const license12 = {
        price: 1200,
        quantity: 1,
        measureName: 'лиц.12мес.',
    };
    const piece = { price: 500, quantity: 2, measureName: 'шт' };

    it('полная сумма строки = цена × количество', () => {
        expect(rowTotalAmount(license12)).toBe(1200);
        expect(rowTotalAmount(piece)).toBe(1000);
    });

    it('месячная доля = сумма строки / месяцы строки', () => {
        expect(rowMonthlyAmount(license12)).toBe(100); // 1200 / 12
        expect(rowMonthlyAmount(piece)).toBe(500); // 1000 / 2 (2 шт × 1)
    });

    it('суммы по набору строк складываются и округляются до 2 знаков', () => {
        const rows = [license12, piece];
        expect(sumRowsTotal(rows)).toBe(2200);
        expect(sumRowsMonthly(rows)).toBe(600);
    });

    it('оплаченные месяцы = Σ количество × множитель', () => {
        expect(sumRowsMonths([license12, piece])).toBe(14); // 12 + 2
    });

    it('пустые строки и отсутствующие поля дают нули без ошибок', () => {
        expect(sumRowsTotal([])).toBe(0);
        expect(sumRowsMonthly([])).toBe(0);
        expect(rowTotalAmount({})).toBe(0);
    });
});
