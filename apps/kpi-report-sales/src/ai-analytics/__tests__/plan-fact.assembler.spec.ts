import 'reflect-metadata';
import {
    DEFAULT_WORK_CALENDAR,
    PLAN_FACT_REASONS,
    type PlanSnapshot,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import {
    buildExposure,
    buildPlanFactView,
    factValuesOf,
    planTargetsOf,
    workdaysElapsed,
} from '../domain/assembler/plan-fact.assembler';
import { workdaysInMonth } from '../domain/loaders/calendar.util';

/**
 * Сборка входа реконсиляции план-факт (Фаза 3, П2). Рабочие дни месяца
 * в ожиданиях считаются той же функцией календаря, что и в коде
 * (`workdaysInMonth`), а не переписаны числом: фикстура с известным
 * ответом, а не заглушка.
 */
const MONTH = '2026-09';
const CALENDAR: WorkCalendar = { ...DEFAULT_WORK_CALENDAR, holidays: [] };
const TOTAL = workdaysInMonth(MONTH, CALENDAR);

/** Снимок целей руководителя с двумя менеджерами. */
function planSnapshot(): PlanSnapshot {
    return {
        monthKey: MONTH,
        takenOn: `${MONTH}-01`,
        managers: [
            {
                managerId: '11',
                sales: 10,
                calls: 200,
                presentations: 40,
                targets: {},
            },
            {
                managerId: '12',
                sales: 6,
                calls: null,
                presentations: 20,
                targets: {},
            },
        ],
        achieversShare: 0.5,
        factMonths: [],
        factManagers: 2,
        planIsWish: false,
        reason: null,
    };
}

/** Месяц менеджера: KPI-вектор и финансовый хвост в форме снапшота. */
function monthPayload(
    sales: number,
    calls: number,
    presentations: number,
): Partial<ManagerMonthPayload> {
    return {
        kpi: { call_done: calls, presentation_done: presentations },
        finance: { salesCount: sales } as ManagerMonthPayload['finance'],
    };
}

describe('workdaysElapsed — прошедшая доля месяца по календарю портала', () => {
    it('месяц в прошлом — все рабочие дни', () => {
        expect(workdaysElapsed(MONTH, '2026-10-05', CALENDAR)).toBe(TOTAL);
    });

    it('месяц в будущем — ноль', () => {
        expect(workdaysElapsed(MONTH, '2026-08-31', CALENDAR)).toBe(0);
    });

    it('текущий месяц — рабочие дни по сегодняшний включительно', () => {
        // 1–4 сентября 2026 — вт–пт, 5–6 выходные, 7 — понедельник.
        expect(workdaysElapsed(MONTH, '2026-09-07', CALENDAR)).toBe(5);
    });

    it('праздник в календаре не считается рабочим днём', () => {
        const withHoliday: WorkCalendar = {
            ...CALENDAR,
            holidays: ['2026-09-03'],
        };
        expect(workdaysElapsed(MONTH, '2026-09-07', withHoliday)).toBe(4);
    });
});

describe('planTargetsOf и factValuesOf', () => {
    it('в реконсиляцию идут три показателя снимка целей', () => {
        const [target] = planSnapshot().managers;
        expect(planTargetsOf(target)).toEqual({
            sales: 10,
            calls: 200,
            presentations: 40,
        });
    });

    it('менеджера в снимке нет — все три цели null', () => {
        expect(planTargetsOf(undefined)).toEqual({
            sales: null,
            calls: null,
            presentations: null,
        });
    });

    it('факт: продажи из финансов, звонки и презентации из KPI-вектора', () => {
        expect(factValuesOf(monthPayload(4, 150, 30))).toEqual({
            sales: 4,
            calls: 150,
            presentations: 30,
        });
    });

    it('месяца менеджера нет — все три факта null, а не нули', () => {
        expect(factValuesOf(undefined)).toEqual({
            sales: null,
            calls: null,
            presentations: null,
        });
    });

    it('чужая форма нагрузки не роняет сборку — null вместо числа', () => {
        const broken = {
            kpi: { call_done: 'много' },
        } as unknown as Partial<ManagerMonthPayload>;
        expect(factValuesOf(broken)).toEqual({
            sales: null,
            calls: null,
            presentations: null,
        });
    });
});

describe('buildExposure', () => {
    const base = {
        monthKey: MONTH,
        managerIds: [],
        plan: null,
        months: new Map<string, Partial<ManagerMonthPayload>>(),
        calendar: CALENDAR,
        today: '2026-09-07',
        dailyPlanEnabled: true,
    };

    it('рабочие дни месяца и прошедшие — из календаря портала', () => {
        expect(buildExposure(base)).toEqual({
            workdaysInMonth: TOTAL,
            workdaysElapsed: 5,
            dailyPlanEnabled: true,
        });
    });

    it('потолок дня портала уезжает в экспозицию', () => {
        expect(buildExposure({ ...base, dayCeiling: 2 }).dayCeiling).toBe(2);
    });
});

describe('buildPlanFactView — полная сборка месяца', () => {
    const build = (
        overrides: Partial<Parameters<typeof buildPlanFactView>[0]> = {},
    ) =>
        buildPlanFactView({
            monthKey: MONTH,
            managerIds: ['11', '12'],
            plan: planSnapshot(),
            months: new Map([
                ['11', monthPayload(5, 100, 20)],
                ['12', monthPayload(4, 120, 10)],
            ]),
            calendar: CALENDAR,
            today: '2026-09-30',
            dailyPlanEnabled: true,
            ...overrides,
        });

    it('приёмка: сумма fact по менеджерам = факт отдела по каждому показателю', () => {
        const view = build();
        for (const teamRow of view.team) {
            const sum = view.managers
                .flatMap(manager =>
                    manager.rows.filter(
                        row => row.indicator === teamRow.indicator,
                    ),
                )
                .reduce((total, row) => total + (row.fact ?? 0), 0);
            expect(teamRow.fact).toBe(sum);
        }
        // Опорные числа фикстуры: 5 + 4 продажи, 100 + 120 звонков.
        expect(view.team.find(row => row.indicator === 'sales')?.fact).toBe(9);
        expect(view.team.find(row => row.indicator === 'calls')?.fact).toBe(
            220,
        );
    });

    it('план отдела — сумма заданных целей; незаданная цель не обнуляет свод', () => {
        const view = build();
        // calls: 200 у первого, null у второго → план отдела 200.
        expect(view.team.find(row => row.indicator === 'calls')?.plan).toBe(
            200,
        );
        expect(view.team.find(row => row.indicator === 'sales')?.plan).toBe(16);
    });

    it('снимка целей нет — строки no-plan с причиной plan-missing, фактов это не трогает', () => {
        const view = build({ plan: null });
        expect(view.hasPlanSnapshot).toBe(false);
        const rows = view.managers[0].rows;
        expect(rows.every(row => row.status === 'no-plan')).toBe(true);
        expect(rows[0].reasons).toContain(PLAN_FACT_REASONS.planMissing);
        expect(rows.every(row => row.pace === null)).toBe(true);
        expect(rows[0].fact).toBe(5);
    });

    it('месяцев менеджеров нет — hasMonthSnapshots false и факт null', () => {
        const view = build({ months: new Map() });
        expect(view.hasMonthSnapshots).toBe(false);
        expect(view.managers[0].rows[0].fact).toBeNull();
        expect(view.managers[0].rows[0].reasons).toContain(
            PLAN_FACT_REASONS.factMissing,
        );
    });

    it('порядок строк менеджеров — порядок запрошенных id', () => {
        const view = build({ managerIds: ['12', '11'] });
        expect(view.managers.map(manager => manager.managerId)).toEqual([
            '12',
            '11',
        ]);
    });

    it('признак «План дня» выключен — perDayNeeded null с причиной, темп на месте', () => {
        const view = build({
            today: '2026-09-15',
            dailyPlanEnabled: false,
        });
        const sales = view.managers[0].rows.find(
            row => row.indicator === 'sales',
        );
        expect(sales?.perDayNeeded).toBeNull();
        expect(sales?.reasons).toContain(PLAN_FACT_REASONS.dailyPlanDisabled);
        expect(sales?.pace).not.toBeNull();
    });
});
