import { registryDefault } from '../params/registry.access';
import {
    PLAN_FACT_INDICATORS,
    PLAN_FACT_REASONS,
    expectedShare,
    forecastAtPace,
    paceStatus,
    perDayNeeded,
    reconcile,
    reconcileTeam,
    workdaysLeft,
    type PlanFactExposure,
} from '../model/plan-fact';

/**
 * Реконсиляция план-факт (Фаза 3, П2). Ожидания считаются формулой от
 * кодов реестра, а не переписанными из кода числами: порог полосы
 * `delta_prac_pct` и потолок дня `plan_day_ceiling` берутся тем же
 * `registryDefault`, что и модель.
 */
const BAND = registryDefault('delta_prac_pct') / 100;
const CEILING = registryDefault('plan_day_ceiling');

/** Половина месяца прошла: 20 рабочих дней, 10 из них позади. */
const halfMonth: PlanFactExposure = {
    workdaysInMonth: 20,
    workdaysElapsed: 10,
};

describe('paceStatus — полоса «идём по плану» из delta_prac_pct', () => {
    it('ровный темп — on-track, края полосы тоже', () => {
        expect(paceStatus(1)).toBe('on-track');
        expect(paceStatus(1 - BAND)).toBe('on-track');
        expect(paceStatus(1 + BAND)).toBe('on-track');
    });

    it('за полосой — behind и ahead', () => {
        expect(paceStatus(1 - BAND - 0.001)).toBe('behind');
        expect(paceStatus(1 + BAND + 0.001)).toBe('ahead');
    });

    it('темпа нет — no-plan (ноль сюда не подставляется)', () => {
        expect(paceStatus(null)).toBe('no-plan');
    });
});

describe('expectedShare и workdaysLeft', () => {
    it('доля месяца = прошедшие / все рабочие дни', () => {
        expect(expectedShare(halfMonth)).toBeCloseTo(0.5, 10);
        expect(workdaysLeft(halfMonth)).toBe(10);
    });

    it('ноль рабочих дней — доли нет (null), а не ноль', () => {
        expect(
            expectedShare({ workdaysInMonth: 0, workdaysElapsed: 0 }),
        ).toBeNull();
        expect(workdaysLeft({ workdaysInMonth: 0, workdaysElapsed: 0 })).toBe(
            0,
        );
    });

    it('прошедших больше, чем всего — срезается до месяца', () => {
        expect(
            expectedShare({ workdaysInMonth: 20, workdaysElapsed: 30 }),
        ).toBeCloseTo(1, 10);
        expect(workdaysLeft({ workdaysInMonth: 20, workdaysElapsed: 30 })).toBe(
            0,
        );
    });
});

describe('forecastAtPace — прогноз при текущем темпе не выше потолка дня', () => {
    it('ровный темп продлевается на остаток месяца', () => {
        // 5 за 10 дней → 0,5 в день; потолок 10/20 × CEILING = 0,75 выше.
        expect(forecastAtPace(10, 5, halfMonth)).toBeCloseTo(5 + 0.5 * 10, 10);
    });

    it('темп выше потолка — прогноз срезан потолком дня', () => {
        // 20 за 10 дней → 2 в день; потолок = CEILING × 10 / 20.
        const ceilingRate = (CEILING * 10) / 20;
        expect(forecastAtPace(10, 20, halfMonth)).toBeCloseTo(
            20 + ceilingRate * 10,
            10,
        );
        expect(ceilingRate).toBeLessThan(2);
    });

    it('без плана потолка нет — прогноз по чистому темпу', () => {
        expect(forecastAtPace(null, 20, halfMonth)).toBeCloseTo(
            20 + 2 * 10,
            10,
        );
    });

    it('прошедших дней нет — прогноза нет; месяц кончился — прогноз = факт', () => {
        expect(
            forecastAtPace(10, 0, { workdaysInMonth: 20, workdaysElapsed: 0 }),
        ).toBeNull();
        expect(
            forecastAtPace(10, 9, { workdaysInMonth: 0, workdaysElapsed: 0 }),
        ).toBe(9);
    });
});

describe('perDayNeeded', () => {
    it('недобор делится на оставшиеся рабочие дни', () => {
        expect(perDayNeeded(10, 4, halfMonth)).toBeCloseTo(6 / 10, 10);
    });

    it('план перевыполнен — ноль, а не отрицательное число', () => {
        expect(perDayNeeded(10, 14, halfMonth)).toBe(0);
    });

    it('рабочих дней не осталось — null', () => {
        expect(
            perDayNeeded(10, 4, { workdaysInMonth: 20, workdaysElapsed: 20 }),
        ).toBeNull();
    });
});

describe('reconcile — строки по справочнику показателей', () => {
    it('порядок строк — порядок PLAN_FACT_INDICATORS', () => {
        const rows = reconcile({
            plan: {},
            fact: {},
            exposure: halfMonth,
        });
        expect(rows.map(row => row.indicator)).toEqual([
            ...PLAN_FACT_INDICATORS,
        ]);
    });

    it('нулевой план → no-plan, ни одного числа кроме плана и факта', () => {
        const [sales] = reconcile({
            plan: { sales: 0 },
            fact: { sales: 3 },
            exposure: halfMonth,
        });
        expect(sales.status).toBe('no-plan');
        expect(sales.reasons).toContain(PLAN_FACT_REASONS.targetEmpty);
        expect([
            sales.pace,
            sales.forecastP50,
            sales.gap,
            sales.perDayNeeded,
        ]).toEqual([null, null, null, null]);
        expect(sales.fact).toBe(3);
    });

    it('плана нет вовсе → причина plan-missing', () => {
        const [sales] = reconcile({
            plan: {},
            fact: { sales: 3 },
            exposure: halfMonth,
        });
        expect(sales.reasons).toContain(PLAN_FACT_REASONS.planMissing);
        expect(sales.plan).toBeNull();
    });

    it('факта нет → причина fact-missing и статус no-plan', () => {
        const [sales] = reconcile({
            plan: { sales: 10 },
            fact: {},
            exposure: halfMonth,
        });
        expect(sales.reasons).toContain(PLAN_FACT_REASONS.factMissing);
        expect(sales.status).toBe('no-plan');
        expect(sales.fact).toBeNull();
    });

    it('темп при нуле рабочих дней → null с причиной no-workdays', () => {
        const [sales] = reconcile({
            plan: { sales: 10 },
            fact: { sales: 4 },
            exposure: { workdaysInMonth: 0, workdaysElapsed: 0 },
        });
        expect(sales.pace).toBeNull();
        expect(sales.reasons).toContain(PLAN_FACT_REASONS.noWorkdays);
        expect(sales.reasons).toContain(PLAN_FACT_REASONS.noDaysLeft);
        expect(sales.status).toBe('no-plan');
    });

    it('ровно по плану на половине месяца — pace 1 и on-track', () => {
        const [sales] = reconcile({
            plan: { sales: 10 },
            fact: { sales: 5 },
            exposure: halfMonth,
        });
        expect(sales.pace).toBeCloseTo(1, 10);
        expect(sales.status).toBe('on-track');
        expect(sales.forecastP50).toBeCloseTo(10, 10);
        expect(sales.gap).toBeCloseTo(0, 10);
        expect(sales.perDayNeeded).toBeCloseTo(0.5, 10);
        expect(sales.reasons).toEqual([]);
    });

    it('отставание: темп ниже полосы, разрыв положительный', () => {
        const [sales] = reconcile({
            plan: { sales: 10 },
            fact: { sales: 2 },
            exposure: halfMonth,
        });
        expect(sales.pace).toBeCloseTo(2 / 5, 10);
        expect(sales.status).toBe('behind');
        expect(sales.gap).toBeCloseTo(10 - (2 + 0.2 * 10), 10);
        expect(sales.gap).toBeGreaterThan(0);
    });

    it('прогноз никогда не выше плана + потолок: опережение срезано', () => {
        const [sales] = reconcile({
            plan: { sales: 10 },
            fact: { sales: 20 },
            exposure: halfMonth,
        });
        expect(sales.status).toBe('ahead');
        // Потолок дня = CEILING × план / рабочие дни.
        const ceiling = 20 + ((CEILING * 10) / 20) * 10;
        expect(sales.forecastP50).toBeCloseTo(ceiling, 10);
        expect(sales.forecastP50 ?? 0).toBeLessThan(20 + 2 * 10);
    });

    it('дневная разбивка выключена → perDayNeeded = null с причиной, числа остаются', () => {
        const [sales] = reconcile({
            plan: { sales: 10 },
            fact: { sales: 5 },
            exposure: { ...halfMonth, dailyPlanEnabled: false },
        });
        expect(sales.perDayNeeded).toBeNull();
        expect(sales.reasons).toContain(PLAN_FACT_REASONS.dailyPlanDisabled);
        expect(sales.pace).toBeCloseTo(1, 10);
        expect(sales.status).toBe('on-track');
    });

    it('dayCeiling = null — потолка нет, прогноз по чистому темпу', () => {
        const [sales] = reconcile({
            plan: { sales: 10 },
            fact: { sales: 20 },
            exposure: { ...halfMonth, dayCeiling: null },
        });
        expect(sales.forecastP50).toBeCloseTo(20 + 2 * 10, 10);
    });
});

describe('reconcileTeam — свод отдела', () => {
    const managers = [
        { plan: { sales: 10, calls: 200 }, fact: { sales: 5, calls: 80 } },
        { plan: { sales: 6 }, fact: { sales: 4, calls: 120 } },
    ].map(item => ({ ...item, exposure: halfMonth }));

    it('сумма плана и факта по менеджерам = строка отдела', () => {
        const rows = reconcileTeam(managers, halfMonth);
        const sales = rows.find(row => row.indicator === 'sales');
        const calls = rows.find(row => row.indicator === 'calls');
        expect(sales?.plan).toBe(16);
        expect(sales?.fact).toBe(9);
        expect(calls?.plan).toBe(200);
        expect(calls?.fact).toBe(200);
    });

    it('показатель, которого нет ни у кого, — план и факт null', () => {
        const rows = reconcileTeam(managers, halfMonth);
        const presentations = rows.find(
            row => row.indicator === 'presentations',
        );
        expect(presentations?.plan).toBeNull();
        expect(presentations?.fact).toBeNull();
        expect(presentations?.status).toBe('no-plan');
    });

    it('пустой отдел — все строки no-plan без чисел', () => {
        const rows = reconcileTeam([], halfMonth);
        expect(rows).toHaveLength(PLAN_FACT_INDICATORS.length);
        expect(rows.every(row => row.status === 'no-plan')).toBe(true);
        expect(rows.every(row => row.forecastP50 === null)).toBe(true);
    });
});
