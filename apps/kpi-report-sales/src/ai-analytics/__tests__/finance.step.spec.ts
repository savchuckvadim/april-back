import 'reflect-metadata';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import type { SnapshotEnvelope } from '@lib/sales-ai-analytics';
import {
    AI_PIPELINE_BACKFILL,
    AI_PIPELINE_BUS_KEYS,
} from '../constants/ai-snapshot.const';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import {
    hotDealsByStageOrder,
    toPipelineByManager,
    type PipelineDeal,
} from '../domain/loaders/finance-pipeline.assembler';
import { FinanceStep, monthsForRun } from '../steps/finance.step';
import { createStepBus } from '../steps/step.types';
import type { StepBus } from '../steps/step.types';
import type { AiAnalyticsSnapshotUpsertResult } from '../store/ai-analytics-snapshot.store';
import {
    financeMonth,
    financeResult,
    kpiManagerMonth,
    kpiMonth,
    kpiMonths,
    pipelineRow,
    snapshotStoreMock,
    stepContext,
} from './fixtures/manager-snapshot.fixture';

/** Загрузчик финансов с готовым результатом. */
function financeLoaderWith(result: ReturnType<typeof financeResult>) {
    const loadFinance = jest.fn().mockResolvedValue(result);
    return { loader: { loadFinance } as never, loadFinance };
}

/** Стор снапшотов фикстуры глазами этой спеки. */
type SnapshotStore = ReturnType<typeof snapshotStoreMock>;

/** Вид вызова upsert на шаге финансов: конверт месячного снапшота. */
type MonthUpsertMock = jest.Mock<
    Promise<AiAnalyticsSnapshotUpsertResult>,
    [SnapshotEnvelope<ManagerMonthPayload>]
>;

/**
 * Конверты, ушедшие в стор. Приведение: фикстура snapshotStoreMock общая
 * для всех шагов и её upsert объявлен без дженериков — вид вызова
 * сужается здесь, в спеке шага, который эти конверты и пишет.
 */
const monthUpserts = (
    store: SnapshotStore,
): SnapshotEnvelope<ManagerMonthPayload>[] =>
    (store.upsert as MonthUpsertMock).mock.calls.map(([envelope]) => envelope);

const defaultFinance = () =>
    financeResult(
        [financeMonth('2026-09', 10, { salesCount: 2, monthlyAmount: 50 })],
        [pipelineRow(10, { count: 5, hot: 3, withOffer: 1 })],
    );

/** Шина с KPI-фактами перечисленных месяцев. */
function busWithKpi(months: string[]): StepBus {
    const bus = createStepBus();
    bus.set(
        AI_PIPELINE_BUS_KEYS.kpiMonths,
        kpiMonths(
            months.map(month =>
                kpiMonth(month, [kpiManagerMonth(10, { callDone: 10 })]),
            ),
        ),
    );
    return bus;
}

/** Сделка пайплайна на стадии лестницы sales_base. */
const deal = (stageCode: string): PipelineDeal => ({
    assignedId: 10,
    stageCode,
    monthlyAmount: 0,
    productRowsAmount: 0,
    companyColor: null,
    contractTypeCode: null,
    contractTypeName: null,
    contractStart: null,
    contractEnd: null,
});

describe('FinanceStep — финансы и месячный снапшот', () => {
    it('код и ритмы шага', () => {
        const step = new FinanceStep(
            financeLoaderWith(defaultFinance()).loader,
            snapshotStoreMock() as never,
        );

        expect(step.code).toBe('finance');
        expect(step.rhythms).toEqual(['nightly', 'monthly', 'backfill']);
    });

    it('пишет месяц по ключу месяца и кладёт финансы в шину', async () => {
        const { loader, loadFinance } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock({ model: { id: 'model-7' } });
        const bus = busWithKpi(['2026-09']);

        const result = await new FinanceStep(loader, store as never).run(
            stepContext(),
            bus,
        );

        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
        expect(bus.get(AI_PIPELINE_BUS_KEYS.financeResult)).toBeDefined();
        expect(loadFinance).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            '2026-09-01',
            '2026-09-30',
            [10],
            expect.objectContaining({ hotStageCode: 'sales_in_progress' }),
        );
        expect(monthUpserts(store)[0]).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            periodKey: '2026-09',
            managerId: '10',
        });
        expect(monthUpserts(store)[0].payload.meta.modelSnapshotId).toBe(
            'model-7',
        );
    });

    it('KPI-фактов в шине нет — шаг пропущен, но финансы соседям отданы', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock();
        const bus = createStepBus();

        const result = await new FinanceStep(loader, store as never).run(
            stepContext(),
            bus,
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('kpi-facts-missing');
        expect(bus.get(AI_PIPELINE_BUS_KEYS.financeResult)).toBeDefined();
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('ростер пуст — шаг пропущен, загрузчик не зовётся', async () => {
        const { loader, loadFinance } = financeLoaderWith(defaultFinance());

        const result = await new FinanceStep(
            loader,
            snapshotStoreMock() as never,
        ).run(stepContext({ managerIds: [] }), createStepBus());

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('roster-empty');
        expect(loadFinance).not.toHaveBeenCalled();
    });

    it('закрытые месяцы из кэша — Битрикс не звали', async () => {
        const { loader } = financeLoaderWith(defaultFinance());

        const result = await new FinanceStep(
            loader,
            snapshotStoreMock() as never,
        ).run(stepContext(), busWithKpi(['2026-09']));

        expect(result.bitrixCalls).toBe(0);
    });
});

describe('Заморозка месяца', () => {
    const frozenRecord = {
        periodKey: '2026-09',
        managerId: '10',
        payload: { frozen: true },
    };

    it('замороженный месяц не перезаписывается', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock({ records: [frozenRecord] });

        const result = await new FinanceStep(loader, store as never).run(
            stepContext({ day: '2026-10-08' }),
            busWithKpi(['2026-09']),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('month-frozen');
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('forceRefresh — единственный обход заморозки', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock({ records: [frozenRecord] });

        const result = await new FinanceStep(loader, store as never).run(
            stepContext({ day: '2026-10-08', forceRefresh: true }),
            busWithKpi(['2026-09']),
        );

        expect(result.written).toBe(1);
        // Проверки заморозки нет вовсе (запрос месячных записей не идёт);
        // запрос снимка планов того же месяца к заморозке отношения не
        // имеет и остаётся — цели в снапшот попасть обязаны.
        expect(store.findByKeys).not.toHaveBeenCalledWith(
            expect.anything(),
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            expect.anything(),
        );
    });

    it('незамороженная запись пересчитывается ночью', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock({
            records: [{ ...frozenRecord, payload: { frozen: false } }],
        });

        const result = await new FinanceStep(loader, store as never).run(
            stepContext(),
            busWithKpi(['2026-09']),
        );

        expect(result.written).toBe(1);
    });
});

describe('Догон истории', () => {
    it('за ночь пишется не больше трёх месяцев manager-month', () => {
        const ctx = stepContext({ rhythm: 'backfill', monthKey: '2026-09' });
        const months = kpiMonths(
            ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map(month =>
                kpiMonth(month, []),
            ),
        );

        const planned = monthsForRun(ctx, months);

        expect(planned).toEqual(['2026-06', '2026-07', '2026-08']);
        expect(planned.length).toBeLessThanOrEqual(
            AI_PIPELINE_BACKFILL.maxMonthsPerNight,
        );
    });

    it('обычный ритм пишет только свой месяц', () => {
        expect(monthsForRun(stepContext(), undefined)).toEqual(['2026-09']);
    });

    it('догон пишет ровно запланированные месяцы', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock();
        const bus = busWithKpi(['2026-06', '2026-07', '2026-08', '2026-09']);

        const result = await new FinanceStep(loader, store as never).run(
            stepContext({ rhythm: 'backfill', day: '2026-09-30' }),
            bus,
        );

        expect(result.written).toBe(AI_PIPELINE_BACKFILL.maxMonthsPerNight);
        expect(monthUpserts(store).map(envelope => envelope.periodKey)).toEqual(
            ['2026-07', '2026-08', '2026-09'],
        );
    });
});

describe('«Горячие» клиенты', () => {
    const deals = [
        deal('sales_pres'),
        deal('sales_in_progress'),
        deal('sales_money_await'),
    ];

    it('горячий — стадия не ниже «В решении» (order ≥ 8)', () => {
        expect(hotDealsByStageOrder(deals)).toHaveLength(2);
        expect(hotDealsByStageOrder(deals, 4)).toHaveLength(3);
    });

    it('числа снапшота совпадают с вкладкой «Финансы» на тех же фильтрах', async () => {
        const pipeline = toPipelineByManager(deals, [10]);
        const { loader } = financeLoaderWith(
            financeResult([financeMonth('2026-09', 10)], pipeline),
        );
        const store = snapshotStoreMock();

        await new FinanceStep(loader, store as never).run(
            stepContext({ day: '2026-09-30' }),
            busWithKpi(['2026-09']),
        );

        const payload = monthUpserts(store)[0].payload;
        expect(pipeline[0].hotEvents).toBe(hotDealsByStageOrder(deals).length);
        expect(payload.finance.pipeline?.hot).toBe(pipeline[0].hotEvents);
        expect(payload.finance.pipeline?.count).toBe(deals.length);
    });
});

/**
 * Цели руководителя в месячном снапшоте (план §3.1, поле `planSnapshot`).
 * Снимок планов делает шаг `plans` тиком 1-го числа, а месяц пишется
 * каждую ночь и догоняется backfill'ом — значит источников два: шина того
 * же прогона и записанный снапшот `ai-analytics-plan`.
 */
describe('Цели месяца: шина или снапшот планов', () => {
    const planPayload = {
        monthKey: '2026-09',
        takenOn: '2026-09-01',
        managers: [
            { managerId: '10', sales: 5, calls: 400, presentations: 30 },
        ],
    };

    it('снимок сделан в этом же прогоне — цели берутся из шины', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock();
        const bus = busWithKpi(['2026-09']);
        bus.set(AI_PIPELINE_BUS_KEYS.plans, planPayload);

        await new FinanceStep(loader, store as never).run(stepContext(), bus);

        expect(monthUpserts(store)[0].payload.planSnapshot).toEqual({
            sales: 5,
            calls: 400,
            presentations: 30,
        });
        expect(store.findByKeys).not.toHaveBeenCalledWith(
            expect.anything(),
            AI_ANALYTICS_SNAPSHOT_TYPE.plan,
            expect.anything(),
        );
    });

    it('шина пуста — цели читаются из снапшота ai-analytics-plan месяца', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock({
            records: [
                { periodKey: '2026-09', managerId: null, payload: planPayload },
            ],
        });

        await new FinanceStep(loader, store as never).run(
            stepContext(),
            busWithKpi(['2026-09']),
        );

        expect(store.findByKeys).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.plan,
            { periodKeys: ['2026-09'] },
        );
        expect(monthUpserts(store)[0].payload.planSnapshot).toEqual({
            sales: 5,
            calls: 400,
            presentations: 30,
        });
    });

    it('целей нет нигде — planSnapshot пуст, прогон идёт дальше', async () => {
        const { loader } = financeLoaderWith(defaultFinance());
        const store = snapshotStoreMock();

        const result = await new FinanceStep(loader, store as never).run(
            stepContext(),
            busWithKpi(['2026-09']),
        );

        expect(result.status).toBe('ok');
        expect(monthUpserts(store)[0].payload.planSnapshot).toBeNull();
    });
});
