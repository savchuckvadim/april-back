import {
    flowTotals,
    forecastMethodOf,
    lagKernel,
    laggedValue,
    managerSalesPerPresentation,
    presentationFlowExpected,
    salesPaceRemainder,
    type FlowMonth,
} from '../model/presentation-flow';
import { fitPresentationFlow } from '../model/presentation-flow.fit';

/**
 * Прогноз «от презентаций» (метод presentations-v2, задача 17.11.2026):
 * ядро сдвига, подбор доли продаж на презентацию и сдвига по истории,
 * правило «портал презентации не отмечает» и ожидание остатка месяца.
 */

const K = 6;

/** Месяц отдела: ключ по номеру, презентации и продажи. */
function month(
    index: number,
    presentationsUniq: number,
    sales: number,
    overrides: Partial<FlowMonth> = {},
): FlowMonth {
    const year = 2025 + Math.floor(index / 12);
    const monthNumber = String((index % 12) + 1).padStart(2, '0');

    return {
        monthKey: `${year}-${monthNumber}`,
        known: true,
        presentationsUniq,
        presentations: presentationsUniq * 2,
        sales,
        ...overrides,
    };
}

/** Ряд презентаций с размахом: 2000, 300, 900, … — сдвиг различим. */
const VARYING = Array.from({ length: 18 }, (_, index) =>
    index % 3 === 0 ? 2000 : index % 3 === 1 ? 300 : 900,
);

/** Продажи = q·Σ w_k·P_{m−k} при ρ = 0,6, q = 0,03 — точные ожидания. */
function exactMonths(): FlowMonth[] {
    const kernel = lagKernel(0.6, K);

    return VARYING.map((presentations, index) =>
        month(index, presentations, 0.03 * laggedValue(VARYING, index, kernel)),
    );
}

describe('lagKernel — ядро сдвига продажи', () => {
    it('сумма — единица, длина K + 1, доли убывают', () => {
        const kernel = lagKernel(0.5, K);

        expect(kernel).toHaveLength(K + 1);
        expect(kernel.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
            1,
            12,
        );
        for (let lag = 1; lag < kernel.length; lag += 1) {
            expect(kernel[lag]).toBeLessThan(kernel[lag - 1]);
        }
        expect(kernel[0]).toBeCloseTo(0.5039, 4);
    });

    it('ρ = 0 — вся продажа в месяц презентации', () => {
        expect(lagKernel(0, 3)).toEqual([1, 0, 0, 0]);
    });
});

describe('fitPresentationFlow — подбор по истории портала', () => {
    it('восстанавливает ρ = 0,6 и q = 0,03 по точным ожиданиям, если ρ₀ далеко', () => {
        const fit = fitPresentationFlow(exactMonths(), { rhoDefault: 0 });

        expect(fit.status).toBe('estimated');
        expect(fit.reason).toBeNull();
        expect(fit.entry).toBe('presentation-uniq');
        expect(fit.rho).toBeCloseTo(0.6, 10);
        expect(fit.q).toBeCloseTo(0.03, 10);
        expect(fit.exposure).toBe('lagged');
        expect(fit.fitMonths).toBe(12);
        expect(fit.deviance).toBeCloseTo(0, 8);
    });

    it('подбор не лучше ρ₀ по отношению правдоподобия — сдвиг по умолчанию', () => {
        const fit = fitPresentationFlow(exactMonths(), { rhoDefault: 0.5 });

        expect(fit.status).toBe('default-lag');
        expect(fit.reason).toBe('lag-not-identified');
        expect(fit.rho).toBe(0.5);
        expect(fit.q).toBeCloseTo(0.0302, 4);
    });

    it('ровный ряд презентаций: сдвиг не различим, доля — продажи на презентацию', () => {
        const months = Array.from({ length: 18 }, (_, index) =>
            month(index, 240, 7.2),
        );
        const fit = fitPresentationFlow(months);

        expect(fit.status).toBe('default-lag');
        expect(fit.reason).toBe('lag-not-identified');
        expect(fit.q).toBeCloseTo(0.03, 10);
    });

    it('истории мало для сдвига — отношение сумм с весами давности', () => {
        const months = [
            month(0, 100, 3),
            month(1, 100, 3),
            month(2, 200, 6),
            month(3, 100, 3),
        ];
        const fit = fitPresentationFlow(months);

        expect(fit.status).toBe('default-lag');
        expect(fit.reason).toBe('lag-history-short');
        expect(fit.exposure).toBe('ratio');
        expect(fit.q).toBeCloseTo(0.03, 10);
        expect(fit.fitMonths).toBe(4);
    });

    it('уникальных презентаций мало, всех хватает — вход «все презентации»', () => {
        const months = Array.from({ length: 6 }, (_, index) =>
            month(index, 0, 3, { presentations: 100 }),
        );
        const fit = fitPresentationFlow(months);

        expect(fit.entry).toBe('presentation');
        expect(fit.status).not.toBe('not-applicable');
        expect(fit.q).toBeCloseTo(0.03, 10);
    });

    it('презентации не отмечаются — прогноз от них не строится', () => {
        const months = Array.from({ length: 12 }, (_, index) =>
            month(index, 3, 7, { presentations: 5 }),
        );
        const fit = fitPresentationFlow(months);

        expect(fit.status).toBe('not-applicable');
        expect(fit.reason).toBe('presentations-not-marked');
        expect(fit.weights.every(weight => weight === 0)).toBe(true);
    });

    it('продаж больше половины презентаций — отмечают не всё', () => {
        const months = Array.from({ length: 6 }, (_, index) =>
            month(index, 20, 15),
        );
        const fit = fitPresentationFlow(months);

        expect(fit.status).toBe('not-applicable');
        expect(fit.reason).toBe('sales-exceed-presentations');
        expect(fit.q).toBeCloseTo(0.75, 10);
    });

    it('меньше трёх месяцев с презентациями — истории мало', () => {
        const months = [
            month(0, 0, 0, { known: false }),
            month(1, 200, 5),
            month(2, 200, 5),
        ];
        const fit = fitPresentationFlow(months);

        expect(fit.status).toBe('not-applicable');
        expect(fit.reason).toBe('history-short');
    });

    it('месяц без снимков рвёт историю сдвига — он и соседи не в подборе', () => {
        const months = exactMonths().map((item, index) =>
            index === 9 ? { ...item, known: false } : item,
        );
        const fit = fitPresentationFlow(months, {
            rhoDefault: 0,
            minFitMonths: 4,
        });

        expect(fit.exposure).toBe('lagged');
        expect(fit.fitMonths).toBe(5);
        expect(fit.weights[9]).toBe(0);
        expect(fit.weights[15]).toBe(0);
        expect(fit.weights[16]).toBeGreaterThan(0);
    });
});

describe('доля менеджера и экспозиция с весами подбора', () => {
    it('суммы менеджеров дают долю портала (экспозиция со сдвигом)', () => {
        const fit = fitPresentationFlow(exactMonths(), { rhoDefault: 0 });
        const months = exactMonths();
        const half = {
            presentations: months.map(item => item.presentationsUniq / 2),
            sales: months.map(item => item.sales / 2),
        };
        const totals = flowTotals(half, fit);

        expect(totals.sales / totals.exposure).toBeCloseTo(fit.q, 10);
    });

    it('нет своих презентаций — доля портала; много — своя', () => {
        const none = managerSalesPerPresentation({
            totals: { sales: 0, exposure: 0 },
            portalQ: 0.03,
            kappa: 300,
        });
        const own = managerSalesPerPresentation({
            totals: { sales: 600, exposure: 10_000 },
            portalQ: 0.03,
            kappa: 300,
        });

        expect(none.value).toBeCloseTo(0.03, 12);
        expect(none.w).toBe(0);
        expect(own.value).toBeCloseTo((600 + 9) / 10_300, 12);
        expect(own.w).toBeGreaterThan(0.95);
    });
});

describe('presentationFlowExpected — остаток месяца', () => {
    const kernel = lagKernel(0.5, K);
    const base = {
        q: 0.03,
        kernel,
        pastPresentations: [240, 240, 240, 240, 240, 240],
        presentationsDone: 120,
        presentationsRate: 12,
        daysTotal: 20,
        daysRemaining: 10,
    };

    it('случай gsr: устойчивые 240 презентаций, полмесяца — 3,6 до конца месяца', () => {
        const result = presentationFlowExpected(base);

        expect(result.remainingShare).toBe(0.5);
        expect(result.backlog).toBeCloseTo(2.6929, 4);
        expect(result.fresh).toBeCloseTo(0.9071, 4);
        expect(result.backlog + result.fresh).toBeCloseTo(3.6, 10);
    });

    it('последний день прошёл — ожидать нечего', () => {
        const result = presentationFlowExpected({ ...base, daysRemaining: 0 });

        expect(result.backlog).toBe(0);
        expect(result.fresh).toBe(0);
    });

    it('новые презентации — квадрат по оставшимся дням', () => {
        const ten = presentationFlowExpected(base).fresh;
        const five = presentationFlowExpected({
            ...base,
            daysRemaining: 5,
        }).fresh;

        expect(five).toBeCloseTo(ten / 4, 12);
    });

    it('прошлых месяцев меньше K — недостающие считаются нулями', () => {
        const result = presentationFlowExpected({
            ...base,
            pastPresentations: [240],
        });

        expect(result.pastEffective).toBeCloseTo(kernel[1] * 240, 12);
    });

    it('запасной расчёт по продажам: средние продажи на долю остатка', () => {
        expect(salesPaceRemainder(4, 20, 5)).toBe(1);
        expect(salesPaceRemainder(null, 20, 5)).toBe(0);
    });
});

describe('forecastMethodOf — совместимость со старыми записями', () => {
    it('нет поля или чужое значение — расчёт по звонкам', () => {
        expect(forecastMethodOf(undefined)).toBe('calls-v1');
        expect(forecastMethodOf('meetings')).toBe('calls-v1');
        expect(forecastMethodOf('presentations-v2')).toBe('presentations-v2');
    });
});
