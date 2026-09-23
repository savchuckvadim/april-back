import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEFAULT_WORK_CALENDAR,
} from '@lib/sales-ai-analytics';
import type { PlanSnapshot, SnapshotEnvelope } from '@lib/sales-ai-analytics';
import {
    AI_PIPELINE_BUS_KEYS,
    AI_PIPELINE_PLANS_STEPS,
} from '../constants/ai-snapshot.const';
import { AI_PIPELINE_CRON } from '../constants/ai-cron.const';
import {
    AI_PLANS_SKIP_REASONS,
    AI_PLANS_WISH,
    AI_PLANS_WISH_REASONS,
} from '../constants/ai-passport.const';
import {
    factMonthKeys,
    monthSalesOf,
    planWish,
    PlansSnapshotUseCase,
    toPlanTarget,
} from '../domain/use-cases/plans-snapshot.use-case';
import type { PlanCheckRow } from '../domain/use-cases/plans-snapshot.use-case';
import { PlansStep } from '../steps/plans.step';
import {
    PLAN_INDICATOR_CODES,
    PLAN_INDICATORS,
    type PlanIndicatorCode,
} from '../../plans';
import type { AiPlanManagerTargets } from '../domain/loaders/plans.types';
import { createStepBus } from '../steps/step.types';
import type { AiPipelineStepContext, StepBus } from '../steps/step.types';

const DOMAIN = 'a.bitrix24.ru';
/** 1 сентября 2026, 04:00 МСК — тик снимка планов. */
const FIRST = new Date('2026-09-01T01:00:00Z');
const MONTH = '2026-09';
const FACT_MONTHS = ['2026-06', '2026-07', '2026-08'];

/** Запись стора в объёме, который читают шаг и юзкейс. */
interface StoreRecord {
    type: string;
    periodKey: string;
    managerId: string | null;
    payload: unknown;
}

/** Цели одного менеджера в ответе загрузчика планов (каталог целиком). */
function targets(
    managerId: number,
    sales: number | null,
): AiPlanManagerTargets {
    const catalog = Object.fromEntries(
        PLAN_INDICATORS.map(indicator => [indicator.code, null]),
    ) as Record<PlanIndicatorCode, number | null>;
    catalog[PLAN_INDICATOR_CODES.sales_count] = sales;
    catalog[PLAN_INDICATOR_CODES.calls_done] = 100;
    catalog[PLAN_INDICATOR_CODES.presentations_done] = 20;

    return {
        managerId,
        sales,
        calls: 100,
        presentations: 20,
        targets: catalog,
    };
}

/** Менеджер-месяц с фактом продаж. */
const monthFact = (
    managerId: string,
    periodKey: string,
    sales: number,
): StoreRecord => ({
    type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
    periodKey,
    managerId,
    payload: { finance: { salesCount: sales } },
});

interface UseCaseCase {
    plansOk?: boolean;
    managers?: ReturnType<typeof targets>[];
    records?: StoreRecord[];
}

function makeUseCase(options: UseCaseCase = {}) {
    const managers = options.managers ?? [targets(10, 5)];
    const plans = {
        loadPlans: jest.fn().mockResolvedValue({
            managerIds: managers.map(row => row.managerId),
            fromCache: false,
            ok: options.plansOk ?? true,
            error: options.plansOk === false ? 'ACCESS_DENIED' : null,
            managers,
        }),
    };
    const rows = options.records ?? [];
    const snapshots = {
        findByKeys: jest.fn(
            (
                _domain: string,
                type: string,
                filter: { periodKeys?: readonly string[] } = {},
            ) =>
                Promise.resolve(
                    rows.filter(
                        row =>
                            row.type === type &&
                            (!filter.periodKeys?.length ||
                                filter.periodKeys.includes(row.periodKey)),
                    ),
                ),
        ),
        upsert: jest.fn<
            Promise<{ id: string; supersededIds: string[] }>,
            [SnapshotEnvelope<PlanSnapshot>]
        >(() => Promise.resolve({ id: '1', supersededIds: [] })),
    };
    const useCase = new PlansSnapshotUseCase(
        plans as never,
        snapshots as never,
    );

    return { useCase, step: new PlansStep(useCase), plans, snapshots };
}

function makeContext(
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext {
    return {
        domain: DOMAIN,
        rhythm: 'monthly',
        day: '2026-09-01',
        weekKey: '2026-W36',
        monthKey: MONTH,
        timeZone: 'Europe/Moscow',
        calendar: DEFAULT_WORK_CALENDAR,
        settings: {},
        registry: {},
        paramsVersion: 'pv-1',
        calcVersion: 'sam-1.0.0',
        comparableFrom: '',
        inputsHash: 'hash',
        managerIds: [10],
        now: FIRST,
        forceRefresh: false,
        ...overrides,
    } as AiPipelineStepContext;
}

const snapshotOf = (bus: StepBus): PlanSnapshot | undefined =>
    bus.get<PlanSnapshot>(AI_PIPELINE_BUS_KEYS.plans);

describe('Снимок планов 1-го числа', () => {
    it('тик планов ежечасный на :00 (локально 1-го 04:00) и ставит только шаг планов', () => {
        expect(AI_PIPELINE_CRON.PLANS).toBe('0 * * * *');
        expect([...AI_PIPELINE_PLANS_STEPS]).toEqual(['plans']);
    });

    it('тик 1-го числа пишет снимок планов месяца', async () => {
        const { step, snapshots } = makeUseCase({
            managers: [targets(10, 5), targets(11, null)],
        });
        const bus = createStepBus();

        const result = await step.run(makeContext(), bus);

        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
        expect(snapshots.upsert).toHaveBeenCalledTimes(1);
        const envelope = snapshots.upsert.mock.calls[0][0];
        expect(envelope.type).toBe(AI_ANALYTICS_SNAPSHOT_TYPE.plan);
        expect(envelope.periodKey).toBe(MONTH);
        expect(envelope.managerId).toBeNull();
        expect(envelope.payload.takenOn).toBe('2026-09-01');
        expect(envelope.payload.managers).toEqual([
            {
                managerId: '10',
                sales: 5,
                calls: 100,
                presentations: 20,
                targets: targets(10, 5).targets,
            },
            {
                managerId: '11',
                sales: null,
                calls: 100,
                presentations: 20,
                targets: targets(11, null).targets,
            },
        ]);
        expect(snapshotOf(bus)?.monthKey).toBe(MONTH);
    });

    it('повторный тик не дублирует: снимок месяца уже есть', async () => {
        const existing: PlanSnapshot = {
            monthKey: MONTH,
            takenOn: '2026-09-01',
            managers: [
                {
                    managerId: '10',
                    sales: 5,
                    calls: null,
                    presentations: null,
                    targets: {},
                },
            ],
            achieversShare: null,
            factMonths: FACT_MONTHS,
            factManagers: 0,
            planIsWish: false,
            reason: AI_PLANS_WISH_REASONS.noFacts,
        };
        const { step, snapshots, plans } = makeUseCase({
            records: [
                {
                    type: AI_ANALYTICS_SNAPSHOT_TYPE.plan,
                    periodKey: MONTH,
                    managerId: null,
                    payload: existing,
                },
            ],
        });
        const bus = createStepBus();

        const result = await step.run(makeContext(), bus);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PLANS_SKIP_REASONS.alreadyCaptured);
        expect(result.written).toBe(0);
        expect(snapshots.upsert).not.toHaveBeenCalled();
        expect(plans.loadPlans).not.toHaveBeenCalled();
        expect(snapshotOf(bus)).toEqual(existing);
    });

    it('заморозка 3-го числа считает закрытый месяц — снимок пропускается', async () => {
        const { step, plans } = makeUseCase();
        const bus = createStepBus();

        const result = await step.run(
            makeContext({ day: '2026-10-03', monthKey: '2026-09' }),
            bus,
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PLANS_SKIP_REASONS.monthClosed);
        expect(plans.loadPlans).not.toHaveBeenCalled();
    });

    it('портал не отдал планы — снимок пустым не пишется', async () => {
        const { step, snapshots } = makeUseCase({ plansOk: false });
        const bus = createStepBus();

        const result = await step.run(makeContext(), bus);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PLANS_SKIP_REASONS.notRead);
        expect(snapshots.upsert).not.toHaveBeenCalled();
    });

    it('пустой ростер — снимок не пишется', async () => {
        const { step, snapshots } = makeUseCase();
        const bus = createStepBus();

        const result = await step.run(makeContext({ managerIds: [] }), bus);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PLANS_SKIP_REASONS.noRoster);
        expect(snapshots.upsert).not.toHaveBeenCalled();
    });

    it('ритм шага — только месячный', () => {
        const { step } = makeUseCase();

        expect([...step.rhythms]).toEqual(['monthly']);
        expect(step.code).toBe('plans');
    });
});

describe('Санити цели: план или пожелание', () => {
    /** n менеджеров: первые achievers выполняют план во все месяцы. */
    function rows(managers: number, achievers: number): PlanCheckRow[] {
        return Array.from({ length: managers }).flatMap((_, index) =>
            FACT_MONTHS.map(monthKey => ({
                managerId: String(10 + index),
                monthKey,
                sales: index < achievers ? 6 : 1,
                target: 5,
            })),
        );
    }

    it('план выполняют меньше трети — флаг «пожелание»', () => {
        expect(planWish(rows(4, 1))).toEqual({
            achieversShare: 0.25,
            factManagers: 4,
            planIsWish: true,
            reason: null,
        });
    });

    it('план выполняет половина — план остаётся планом', () => {
        expect(planWish(rows(4, 2))).toMatchObject({
            achieversShare: 0.5,
            planIsWish: false,
        });
    });

    it('менеджер засчитан, если закрыл план в половине своих месяцев', () => {
        const half: PlanCheckRow[] = [
            { managerId: '10', monthKey: '2026-06', sales: 6, target: 5 },
            { managerId: '10', monthKey: '2026-07', sales: 1, target: 5 },
            { managerId: '11', monthKey: '2026-06', sales: 1, target: 5 },
            { managerId: '12', monthKey: '2026-06', sales: 1, target: 5 },
        ];

        expect(planWish(half)).toMatchObject({
            achieversShare: 1 / 3,
            planIsWish: false,
        });
    });

    it('меньше трёх менеджеров с планом и фактом — доля не считается', () => {
        expect(planWish(rows(2, 0))).toMatchObject({
            achieversShare: null,
            planIsWish: false,
            reason: AI_PLANS_WISH_REASONS.noTargets,
        });
        expect(planWish([])).toMatchObject({
            achieversShare: null,
            factManagers: 0,
            reason: AI_PLANS_WISH_REASONS.noFacts,
        });
    });

    it('месяцы без плана в санити не участвуют', () => {
        const noTarget: PlanCheckRow[] = FACT_MONTHS.map(monthKey => ({
            managerId: '10',
            monthKey,
            sales: 0,
            target: null,
        }));

        expect(planWish(noTarget).achieversShare).toBeNull();
    });

    it('порог трети и окно трёх месяцев — из констант потока', () => {
        expect(AI_PLANS_WISH.share).toBe(0.3);
        expect(AI_PLANS_WISH.factMonths).toBe(3);
    });

    it('снимок несёт флаг «пожелание» по фактам трёх месяцев', async () => {
        const { step, snapshots } = makeUseCase({
            managers: [10, 11, 12, 13].map(id => targets(id, 5)),
            records: [10, 11, 12, 13].flatMap(id =>
                FACT_MONTHS.map(monthKey =>
                    monthFact(String(id), monthKey, id === 10 ? 6 : 1),
                ),
            ),
        });
        const bus = createStepBus();

        await step.run(makeContext({ managerIds: [10, 11, 12, 13] }), bus);

        expect(snapshotOf(bus)).toMatchObject({
            achieversShare: 0.25,
            factManagers: 4,
            factMonths: FACT_MONTHS,
            planIsWish: true,
            reason: null,
        });
        expect(snapshots.upsert).toHaveBeenCalledTimes(1);
    });

    it('план месяца берётся из снимка того месяца, а не из текущего', async () => {
        const { step } = makeUseCase({
            managers: [10, 11, 12].map(id => targets(id, 99)),
            records: [
                ...[10, 11, 12].flatMap(id =>
                    FACT_MONTHS.map(monthKey =>
                        monthFact(String(id), monthKey, 6),
                    ),
                ),
                ...FACT_MONTHS.map(monthKey => ({
                    type: AI_ANALYTICS_SNAPSHOT_TYPE.plan,
                    periodKey: monthKey,
                    managerId: null,
                    payload: {
                        managers: [10, 11, 12].map(id => ({
                            managerId: String(id),
                            sales: 5,
                            calls: null,
                            presentations: null,
                            targets: {},
                        })),
                    },
                })),
            ],
        });
        const bus = createStepBus();

        await step.run(makeContext({ managerIds: [10, 11, 12] }), bus);

        // Текущая цель 99 не выполнена никем, план месяца (5) — всеми.
        expect(snapshotOf(bus)).toMatchObject({
            achieversShare: 1,
            planIsWish: false,
        });
    });
});

describe('Чистые помощники снимка планов', () => {
    it('factMonthKeys — три месяца перед месяцем снимка по возрастанию', () => {
        expect(factMonthKeys(MONTH, 3)).toEqual(FACT_MONTHS);
        expect(factMonthKeys('2026-01', 2)).toEqual(['2025-11', '2025-12']);
    });

    it('monthSalesOf — факт продаж из нагрузки снапшота', () => {
        expect(monthSalesOf({ finance: { salesCount: 3 } })).toBe(3);
        expect(monthSalesOf({ finance: {} })).toBeNull();
        expect(monthSalesOf(null)).toBeNull();
    });

    it('toPlanTarget — id строкой, каталог показателей копируется', () => {
        const source = targets(10, 5);

        expect(toPlanTarget(source)).toEqual({
            managerId: '10',
            sales: 5,
            calls: 100,
            presentations: 20,
            targets: source.targets,
        });
        expect(toPlanTarget(source).targets).not.toBe(source.targets);
    });
});
