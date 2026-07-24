import {
    effectiveRowMonths,
    measureMonthFactorFromName,
} from '../measure-month-factor';

describe('measureMonthFactorFromName', () => {
    it("возвращает 12 для 'лиц.12мес.'", () => {
        expect(measureMonthFactorFromName('лиц.12мес.')).toBe(12);
    });

    it("24 приоритетнее 12 ('лиц.24мес.')", () => {
        expect(measureMonthFactorFromName('лиц.24мес.')).toBe(24);
    });

    it('возвращает 6 и 3 для соответствующих единиц', () => {
        expect(measureMonthFactorFromName('лиц.6мес.')).toBe(6);
        expect(measureMonthFactorFromName('лиц.3мес.')).toBe(3);
    });

    it('возвращает 1 при пустом или неизвестном measureName', () => {
        expect(measureMonthFactorFromName(undefined)).toBe(1);
        expect(measureMonthFactorFromName('')).toBe(1);
        expect(measureMonthFactorFromName('шт')).toBe(1);
    });
});

describe('effectiveRowMonths', () => {
    it('количество × множитель: 2 × лиц.12мес. → 24 месяца', () => {
        expect(
            effectiveRowMonths({ quantity: 2, measureName: 'лиц.12мес.' }),
        ).toBe(24);
    });

    it('минимум 1 месяц при нулевом количестве', () => {
        expect(effectiveRowMonths({ quantity: 0, measureName: 'шт' })).toBe(1);
    });

    it('дробное количество округляется вниз: 1.5 × 12 → 18', () => {
        expect(
            effectiveRowMonths({ quantity: 1.5, measureName: 'лиц.12мес.' }),
        ).toBe(18);
    });
});
