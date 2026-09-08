import {
    CAPACITY_DEFAULTS,
    CapacityDayRate,
    bindingConstraint,
    capacityQuantile,
    quantileOf,
    timeBudget,
} from '../model/capacity';

/**
 * Capacity полосы стажа, связующее ограничение и бюджет времени дня
 * (план §4.9; Фаза 2, поток `p2-model-forecast-plan`).
 */

/** Девять менеджер-месяцев: 3 менеджера × 3 месяца, темпы 1…9. */
const BAND_RATES: CapacityDayRate[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    (rate, index) => ({
        managerId: `m${Math.floor(index / 3)}`,
        monthKey: `2026-0${(index % 3) + 4}`,
        rate,
    }),
);

/** Дефолт реестра `cap_level_activity` для презентаций. */
const PRESENTATION_FALLBACK = 3;

describe('quantileOf', () => {
    it('линейная интерполяция типа 7: p90 из 1…10 равен 9,1', () => {
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(quantileOf(values, 0.9)).toBeCloseTo(9.1, 10);
        expect(quantileOf(values, 0.5)).toBeCloseTo(5.5, 10);
        expect(quantileOf(values, 1)).toBe(10);
        expect(quantileOf(values, 0)).toBe(1);
    });

    it('порядок входа не важен, пустая выборка даёт ноль', () => {
        expect(quantileOf([9, 1, 5], 0.5)).toBe(5);
        expect(quantileOf([], 0.9)).toBe(0);
    });
});

describe('capacityQuantile', () => {
    it('p90 при ≥ 3 менеджера × 3 месяца', () => {
        const result = capacityQuantile(BAND_RATES, {
            fallback: PRESENTATION_FALLBACK,
        });
        expect(result.source).toBe('estimated');
        expect(result.cap).toBeCloseTo(8.2, 10);
        expect(result.managers).toBe(3);
        expect(result.months).toBe(3);
        expect(result.n).toBe(9);
        expect(CAPACITY_DEFAULTS.quantile).toBe(0.9);
    });

    it('меньше трёх менеджеров — дефолт реестра, а не чужой личный потолок', () => {
        const twoManagers = BAND_RATES.filter(item => item.managerId !== 'm2');
        const result = capacityQuantile(twoManagers, {
            fallback: PRESENTATION_FALLBACK,
        });
        expect(result.source).toBe('default');
        expect(result.cap).toBe(PRESENTATION_FALLBACK);
        expect(result.managers).toBe(2);
    });

    it('меньше трёх месяцев — тоже дефолт', () => {
        const twoMonths = BAND_RATES.filter(
            item => item.monthKey !== '2026-06',
        );
        expect(
            capacityQuantile(twoMonths, { fallback: PRESENTATION_FALLBACK })
                .source,
        ).toBe('default');
    });

    it('proxy-месяцы не входят в оценку и могут сорвать гейт', () => {
        const withProxy = BAND_RATES.map(item =>
            item.managerId === 'm2' ? { ...item, proxy: true } : item,
        );
        const result = capacityQuantile(withProxy, {
            fallback: PRESENTATION_FALLBACK,
        });
        expect(result.n).toBe(6);
        expect(result.source).toBe('default');
    });

    it('квантиль настраивается кодом cap_quantile', () => {
        expect(
            capacityQuantile(BAND_RATES, {
                fallback: PRESENTATION_FALLBACK,
                quantile: 0.5,
            }).cap,
        ).toBeCloseTo(5, 10);
    });
});

describe('bindingConstraint', () => {
    /** Иллюстрация 4.9: 190 презентаций ⇒ ≈ 3 800 звонков за 12 дней. */
    const required = [
        { edge: 'call_to_presentation', required: 3800 },
        { edge: 'presentation_to_sale', required: 190 },
    ];
    const caps = {
        byEdge: { call_to_presentation: 25, presentation_to_sale: 3 },
        daysRemaining: 12,
    };

    it('связующее — первое ребро воронки, упирающееся в capacity', () => {
        const result = bindingConstraint(required, caps);
        expect(result.edge).toBe('call_to_presentation');
        expect(result.unreachable).toBe(true);
        expect(result.perDay).toBeCloseTo(3800 / 12, 10);
        expect(result.cap).toBe(25);
    });

    it('внутри потолков ограничения нет', () => {
        expect(
            bindingConstraint(
                [{ edge: 'call_to_presentation', required: 120 }],
                caps,
            ),
        ).toEqual({ edge: null, unreachable: false, perDay: null, cap: null });
    });

    it('ребро без оценённого потолка пропускается', () => {
        const result = bindingConstraint(required, {
            byEdge: { call_to_presentation: null, presentation_to_sale: 3 },
            daysRemaining: 12,
        });
        expect(result.edge).toBe('presentation_to_sale');
    });

    it('при нуле оставшихся дней деления на ноль нет', () => {
        const result = bindingConstraint(required, {
            ...caps,
            daysRemaining: 0,
        });
        expect(result.unreachable).toBe(true);
        expect(result.perDay).toBeNull();
        expect(result.edge).toBe('call_to_presentation');
    });

    it('нулевой остаток объёма ограничением не считается', () => {
        expect(
            bindingConstraint([{ edge: 'call_to_presentation', required: 0 }], {
                ...caps,
                daysRemaining: 0,
            }).unreachable,
        ).toBe(false);
    });
});

describe('timeBudget', () => {
    const durations = { cold: 6, call: 12, presentation: 45 };

    it('минуты складываются и сравниваются с day_hours·60', () => {
        const result = timeBudget({ cold: 10, call: 5 }, durations, 6);
        expect(result.minutes).toBe(120);
        expect(result.limitMinutes).toBe(360);
        expect(result.withinBudget).toBe(true);
    });

    it('превышение бюджета даёт признак «не влезает»', () => {
        const result = timeBudget(
            { cold: 20, call: 10, presentation: 6 },
            durations,
            6,
        );
        expect(result.minutes).toBe(510);
        expect(result.withinBudget).toBe(false);
    });

    it('ровно по границе бюджет считается уложившимся', () => {
        expect(timeBudget({ call: 30 }, durations, 6).withinBudget).toBe(true);
    });

    it('неизвестная длительность типа считается нулевой', () => {
        expect(timeBudget({ payment: 5 }, durations).minutes).toBe(0);
        expect(CAPACITY_DEFAULTS.dayHours).toBe(6);
    });
});
