import {
    DAILY_PLAN_DEFAULTS,
    DailyPlanTypeInput,
    dailyPlan,
    requiredVolume,
    unwindPaths,
} from '../model/daily-plan';
import { exponentialLagCdf, meanMaturity } from '../model/lag-cdf';
import { mulberry32, seedOf } from '../model/prng';

/**
 * План на день как обратная задача (план §4.9; Фаза 2, поток
 * `p2-model-forecast-plan`). Числа иллюстрации 4.9 согласованы в плане и
 * воспроизводятся здесь целиком: цель 3, `λ_pipe = 0,6`, `θ = 0,09`,
 * `F̄(12) = 0,14` → `N_req ≈ 190` презентаций ⇒ при `E1 = 0,05` ≈ 3 800
 * звонков за 12 дней, что выше capacity.
 */

/** Средняя зрелость иллюстрации — ровно то число, что стоит в плане. */
const F_BAR = 0.14;

/** Вход обратной задачи из иллюстрации 4.9. */
const ILLUSTRATION = {
    target: 3,
    doneSales: 0,
    pipeline: 0.6,
    conversion: 0.09,
    fBar: F_BAR,
};

describe('requiredVolume — иллюстрация 4.9', () => {
    it('N_req = 2,4 / (0,09 · 0,14) ≈ 190 презентаций', () => {
        const nReq = requiredVolume(ILLUSTRATION);
        expect(nReq).toBeCloseTo(2.4 / 0.0126, 6);
        expect(Math.round(nReq)).toBe(190);
    });

    it('цель уже закрыта продажами и пайплайном → ноль', () => {
        expect(requiredVolume({ ...ILLUSTRATION, doneSales: 3 })).toBe(0);
        expect(requiredVolume({ ...ILLUSTRATION, pipeline: 5 })).toBe(0);
    });

    it('без пайплайна недобор считается только от факта', () => {
        expect(requiredVolume({ ...ILLUSTRATION, pipeline: null })).toBeCloseTo(
            3 / 0.0126,
            6,
        );
    });

    it('F̄ ниже 0,1 заменяется порогом f_min', () => {
        expect(DAILY_PLAN_DEFAULTS.fMin).toBe(0.1);
        expect(requiredVolume({ ...ILLUSTRATION, fBar: 0.05 })).toBeCloseTo(
            requiredVolume({ ...ILLUSTRATION, fBar: 0.1 }),
            10,
        );
        expect(requiredVolume({ ...ILLUSTRATION, fBar: 0 })).toBeCloseTo(
            2.4 / (0.09 * 0.1),
            6,
        );
    });

    it('в режиме без связи r(Ŝ) не применяется', () => {
        const withoutLink = requiredVolume(ILLUSTRATION);
        expect(requiredVolume({ ...ILLUSTRATION, qualityMultiplier: 1 })).toBe(
            withoutLink,
        );
        expect(
            requiredVolume({ ...ILLUSTRATION, qualityMultiplier: 1.2 }),
        ).toBeCloseTo(withoutLink / 1.2, 6);
    });

    it('нулевая конверсия — честная бесконечность, а не тихий ноль', () => {
        expect(requiredVolume({ ...ILLUSTRATION, conversion: 0 })).toBe(
            Number.POSITIVE_INFINITY,
        );
    });

    it('согласовано с F̄ из экспоненты медианы 28 дней', () => {
        const fBar = meanMaturity(exponentialLagCdf(28), 12);
        const nReq = requiredVolume({ ...ILLUSTRATION, fBar });
        // Точное F̄(12) = 0,1455 против округлённых 0,14 в иллюстрации.
        expect(nReq).toBeGreaterThan(180);
        expect(nReq).toBeLessThan(190.5);
    });
});

describe('unwindPaths', () => {
    it('190 презентаций при E1 = 0,05 — это ≈ 3 800 звонков', () => {
        const nReq = requiredVolume(ILLUSTRATION);
        const unwinded = unwindPaths(nReq, { call_to_presentation: 0.05 }, [
            { code: 'main', edges: ['call_to_presentation'] },
        ]);
        expect(unwinded).toHaveLength(1);
        expect(Math.round(unwinded[0].required / 100) * 100).toBe(3800);
        expect(unwinded[0].unreachable).toBe(false);
    });

    it('разворот идёт от продажи ко входу: N_k = N_{k+1}/θ_k', () => {
        const unwinded = unwindPaths(9, { e1: 0.05, e5: 0.09 }, [
            { code: 'main', edges: ['e1', 'e5'] },
        ]);
        expect(unwinded.map(item => item.edge)).toEqual(['e1', 'e5']);
        expect(unwinded[1].required).toBeCloseTo(100, 10);
        expect(unwinded[0].required).toBeCloseTo(2000, 10);
    });

    it('пути делятся по исторической доле и складываются по рёбрам', () => {
        const unwinded = unwindPaths(100, { a: 0.5, b: 0.2 }, [
            { code: 'p1', edges: ['a'], share: 0.6 },
            { code: 'p2', edges: ['b'], share: 0.4 },
        ]);
        expect(unwinded[0].required).toBeCloseTo(120, 10);
        expect(unwinded[1].required).toBeCloseTo(200, 10);
    });

    it('без долей пути считаются равными', () => {
        const unwinded = unwindPaths(100, { a: 0.5, b: 0.5 }, [
            { code: 'p1', edges: ['a'] },
            { code: 'p2', edges: ['b'] },
        ]);
        expect(unwinded[0].required).toBeCloseTo(100, 10);
        expect(unwinded[1].required).toBeCloseTo(100, 10);
    });

    it('θ = 0 помечает ребро недостижимым, а не делит на ноль', () => {
        const unwinded = unwindPaths(10, { e1: 0.5, e5: 0 }, [
            { code: 'main', edges: ['e1', 'e5'] },
        ]);
        expect(unwinded.every(item => item.unreachable)).toBe(true);
        expect(unwinded[0].required).toBe(Number.POSITIVE_INFINITY);
    });
});

/** Три типа активности с утечками: презентации текут сильнее звонков. */
const PLAN_ITEMS: DailyPlanTypeInput[] = [
    {
        callType: 'call',
        edge: 'call_to_presentation',
        requiredRemaining: 100,
        doneMonth: 20,
        leak: 0.2,
        durationMin: 12,
    },
    {
        callType: 'presentation',
        edge: 'presentation_to_sale',
        requiredRemaining: 10,
        doneMonth: 5,
        leak: 0.9,
        durationMin: 45,
    },
    {
        callType: 'cold',
        edge: 'cold_to_call',
        requiredRemaining: 40,
        doneMonth: 0,
        leak: null,
        durationMin: 6,
    },
];

describe('dailyPlan', () => {
    const base = { items: PLAN_ITEMS, workdaysInMonth: 20, daysLeft: 10 };

    it('приоритет типов — по утечке L_k убыванию, без L_k в конец', () => {
        expect(dailyPlan(base).items.map(item => item.callType)).toEqual([
            'presentation',
            'call',
            'cold',
        ]);
        expect(dailyPlan(base).items.map(item => item.priority)).toEqual([
            1, 2, 3,
        ]);
    });

    it('дневное число — остаток месячного плана на оставшиеся дни', () => {
        const call = dailyPlan({ ...base, daysLeft: 15 }).items.find(
            item => item.callType === 'call',
        );
        expect(call?.monthPlan).toBe(120);
        expect(call?.monthDone).toBe(20);
        expect(call?.requiredToday).toBeCloseTo(100 / 15, 10);
        expect(call?.cappedByCeiling).toBe(false);
    });

    it('план дня упирается в потолок plan_day_ceiling × план/D_m', () => {
        const plan = dailyPlan({ ...base, daysLeft: 2 });
        const call = plan.items.find(item => item.callType === 'call');
        expect(DAILY_PLAN_DEFAULTS.ceilingMultiplier).toBe(1.5);
        expect(call?.ceiling).toBeCloseTo((1.5 * 120) / 20, 10);
        expect(call?.requiredToday).toBeCloseTo(9, 10);
        expect(call?.cappedByCeiling).toBe(true);
    });

    it('обучающий минимум поднимает презентации', () => {
        const withTraining = dailyPlan({
            ...base,
            items: PLAN_ITEMS.map(item =>
                item.callType === 'presentation'
                    ? { ...item, trainingMinMonth: 20 }
                    : item,
            ),
            daysLeft: 20,
        });
        const presentation = withTraining.items[0];
        expect(presentation.callType).toBe('presentation');
        expect(presentation.monthPlan).toBe(20);
        expect(presentation.trainingApplied).toBe(true);
        expect(presentation.requiredToday).toBeCloseTo(0.75, 10);
        const without = dailyPlan({ ...base, daysLeft: 20 }).items[0];
        expect(presentation.requiredToday).toBeGreaterThan(
            without.requiredToday,
        );
    });

    it('при days_left = 0 деления на ноль нет', () => {
        const plan = dailyPlan({ ...base, daysLeft: 0 });
        for (const item of plan.items) {
            expect(item.requiredToday).toBe(0);
            expect(Number.isFinite(item.requiredToday)).toBe(true);
        }
    });

    it('недостижимый объём не превращается в NaN', () => {
        const plan = dailyPlan({
            ...base,
            items: [
                {
                    callType: 'call',
                    requiredRemaining: Number.POSITIVE_INFINITY,
                    doneMonth: 10,
                },
            ],
        });
        expect(plan.items[0].unreachable).toBe(true);
        expect(Number.isFinite(plan.items[0].requiredToday)).toBe(true);
    });

    it('превышение дневного бюджета времени даёт «не влезает»', () => {
        const tight = dailyPlan({ ...base, daysLeft: 2, dayHours: 2 });
        // 9 звонков × 12 + 1,125 презентации × 45 + 3 холодных × 6 мин.
        expect(tight.budget.minutes).toBeCloseTo(176.625, 3);
        expect(tight.budget.limitMinutes).toBe(120);
        expect(tight.budget.withinBudget).toBe(false);
        const roomy = dailyPlan({ ...base, daysLeft: 2, dayHours: 6 });
        expect(roomy.budget.limitMinutes).toBe(360);
        expect(roomy.budget.withinBudget).toBe(true);
    });

    it('объяснение содержит дни, правило потолка, типы и бюджет', () => {
        const steps = dailyPlan(base).steps;
        const codes = steps.map(step => step.code);
        expect(codes).toContain('days_left');
        expect(codes).toContain('ceiling_rule');
        expect(codes).toContain('time_budget');
        expect(codes).toContain('plan:presentation');
        expect(steps.every(step => step.text.length > 0)).toBe(true);
    });
});

describe('dailyPlan — свойства на 1000 входов', () => {
    const random = mulberry32(seedOf('daily-plan', 'property', 'sam-1.0.0'));

    it('план дня никогда не превышает потолок и остаётся конечным', () => {
        for (let run = 0; run < 1000; run += 1) {
            const workdays = 1 + Math.floor(random() * 22);
            const daysLeft = Math.floor(random() * (workdays + 1));
            const plan = dailyPlan({
                workdaysInMonth: workdays,
                daysLeft,
                ceilingMultiplier: 1 + random() * 1.5,
                dayHours: 2 + random() * 8,
                items: [
                    {
                        callType: 'call',
                        requiredRemaining: random() * 500,
                        doneMonth: random() * 200,
                        trainingMinMonth: random() < 0.2 ? random() * 50 : 0,
                        durationMin: 12,
                        leak: random(),
                    },
                    {
                        callType: 'presentation',
                        requiredRemaining: random() * 40,
                        doneMonth: random() * 20,
                        durationMin: 45,
                        leak: random(),
                    },
                ],
            });
            for (const item of plan.items) {
                expect(Number.isFinite(item.requiredToday)).toBe(true);
                expect(item.requiredToday).toBeGreaterThanOrEqual(0);
                expect(item.requiredToday).toBeLessThanOrEqual(
                    item.ceiling + 1e-9,
                );
            }
        }
    });

    it('нулевой остаток дней всегда даёт нулевой план', () => {
        for (let run = 0; run < 50; run += 1) {
            const plan = dailyPlan({
                workdaysInMonth: 20,
                daysLeft: 0,
                items: [
                    {
                        callType: 'call',
                        requiredRemaining: random() * 500,
                        doneMonth: random() * 200,
                    },
                ],
            });
            expect(plan.items[0].requiredToday).toBe(0);
        }
    });
});
