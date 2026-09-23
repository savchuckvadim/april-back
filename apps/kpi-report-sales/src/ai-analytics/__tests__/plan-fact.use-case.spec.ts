import 'reflect-metadata';
import {
    DEFAULT_WORK_CALENDAR,
    PLAN_FACT_REASONS,
    type PlanSnapshot,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import {
    AI_PLAN_FACT_REASONS,
    AI_PLAN_FACT_TTL_SECONDS,
    buildPlanFactKey,
    planFactUsersKey,
} from '../constants/ai-plan-fact.const';
import { buildResetPattern } from '../cache/cache-key.util';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import { PlanFactUseCase } from '../plan-fact/plan-fact.use-case';
import type { AiPlanFactRequestDto } from '../dto/ai-plan-fact.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

/**
 * Сценарий ручки реконсиляции план-факт (Фаза 3, П2). Стор снапшотов,
 * кэш и ростер — моки; расчёт идёт настоящим ассемблером и настоящей
 * моделью библиотеки, поэтому числа в ожиданиях выведены формулой.
 */
const DOMAIN = 'a.bitrix24.ru';
const MONTH = '2026-09';
const CALENDAR: WorkCalendar = { ...DEFAULT_WORK_CALENDAR, holidays: [] };
/** «Сейчас» — октябрь: сентябрь закрыт (снапшоты заморожены). */
const NOW_CLOSED = new Date('2026-10-05T09:00:00.000Z');
/** «Сейчас» внутри месяца — 15 сентября. */
const NOW_LIVE = new Date('2026-09-15T09:00:00.000Z');

const leader: RequesterAccess = { role: 'op', visibleManagerIds: null };
const limited: RequesterAccess = { role: 'group', visibleManagerIds: ['11'] };

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
                calls: 100,
                presentations: 20,
                targets: {},
            },
        ],
        achieversShare: null,
        factMonths: [],
        factManagers: 0,
        planIsWish: false,
        reason: null,
    };
}

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

interface UseCaseOptions {
    readonly plan?: PlanSnapshot | null;
    readonly months?: ReadonlyArray<{
        readonly managerId: string;
        readonly payload: Partial<ManagerMonthPayload>;
    }>;
    readonly dailyPlanEnabled?: boolean;
    readonly roster?: number[];
    readonly cached?: unknown;
}

function makeUseCase(options: UseCaseOptions = {}) {
    const plan = options.plan === undefined ? planSnapshot() : options.plan;
    const findByKeys = jest.fn().mockResolvedValue(
        plan === null
            ? []
            : [
                  {
                      id: 'ais-plan-1',
                      periodKey: MONTH,
                      managerId: null,
                      payload: plan,
                  },
              ],
    );
    const months = options.months ?? [
        { managerId: '11', payload: monthPayload(5, 100, 20) },
        { managerId: '12', payload: monthPayload(4, 120, 10) },
    ];
    const findManagerMonths = jest.fn().mockResolvedValue(
        months.map((item, index) => ({
            id: `ais-month-${index}`,
            periodKey: MONTH,
            managerId: item.managerId,
            payload: item.payload,
        })),
    );
    const remember = jest.fn(
        async (key: string, ttl: number, compute: () => Promise<unknown>) =>
            options.cached === undefined
                ? { value: await compute(), fromCache: false }
                : { value: options.cached, fromCache: true },
    );
    const settings = settingsLoaderWith({
        dailyPlanEnabled: options.dailyPlanEnabled ?? true,
        calendar: CALENDAR,
    });
    const resolve = jest.fn().mockResolvedValue(options.roster ?? [11, 12]);
    const useCase = new PlanFactUseCase(
        settings,
        { resolve } as never,
        { remember } as never,
        { findByKeys, findManagerMonths } as never,
    );

    return { useCase, remember, findByKeys, findManagerMonths, resolve };
}

const request = (
    overrides: Partial<AiPlanFactRequestDto> = {},
): AiPlanFactRequestDto =>
    ({
        domain: DOMAIN,
        requesterUserId: '447',
        monthKey: MONTH,
        ...overrides,
    }) as AiPlanFactRequestDto;

describe('PlanFactUseCase — реконсиляция план-факт', () => {
    it('ready с конвертом, ключ кэша — секция plan, попадает под общий сброс', async () => {
        const { useCase, remember } = makeUseCase();
        const result = await useCase.execute(request(), leader, NOW_CLOSED);
        const key = buildPlanFactKey(
            DOMAIN,
            MONTH,
            planFactUsersKey(['11', '12']),
        );
        expect(result.status).toBe('ready');
        expect(result.requestKey).toBe(key);
        expect(remember).toHaveBeenCalledWith(
            key,
            AI_PLAN_FACT_TTL_SECONDS.closed,
            expect.any(Function),
        );
        // Ключ входит в паттерн сброса секции plan — новой ручки сброса нет.
        const pattern = buildResetPattern(DOMAIN, 'plan');
        expect(key.startsWith(pattern.slice(0, -1))).toBe(true);
    });

    it('закрытый месяц — долгий TTL и ни одного обращения к Битриксу', async () => {
        const { useCase, remember, findByKeys, findManagerMonths } =
            makeUseCase();
        await useCase.execute(request(), leader, NOW_CLOSED);
        expect(remember.mock.calls[0][1]).toBe(AI_PLAN_FACT_TTL_SECONDS.closed);
        // Источник данных — только стор снапшотов ais.
        expect(findByKeys).toHaveBeenCalledTimes(1);
        expect(findManagerMonths).toHaveBeenCalledTimes(1);
    });

    it('закрытый месяц из кэша — снапшоты не читаются вовсе', async () => {
        const { useCase, findByKeys, findManagerMonths } = makeUseCase({
            cached: {
                monthKey: MONTH,
                exposure: {
                    workdaysInMonth: 22,
                    workdaysElapsed: 22,
                    dailyPlanEnabled: true,
                },
                managers: [],
                team: [],
                hasPlanSnapshot: true,
                hasMonthSnapshots: true,
            },
        });
        const result = await useCase.execute(request(), leader, NOW_CLOSED);
        expect(findByKeys).not.toHaveBeenCalled();
        expect(findManagerMonths).not.toHaveBeenCalled();
        expect(result.data?.period.closed).toBe(true);
        expect(result.data?.rows).toEqual([]);
    });

    it('текущий месяц — короткий TTL и closed = false', async () => {
        const { useCase, remember } = makeUseCase();
        const result = await useCase.execute(request(), leader, NOW_LIVE);
        expect(remember.mock.calls[0][1]).toBe(AI_PLAN_FACT_TTL_SECONDS.live);
        expect(result.data?.period.closed).toBe(false);
        expect(result.data?.period.today).toBe('2026-09-15');
    });

    it('приёмка: сумма fact по менеджерам = факт отдела', async () => {
        const { useCase } = makeUseCase();
        const data = (await useCase.execute(request(), leader, NOW_CLOSED))
            .data;
        for (const teamRow of data?.team ?? []) {
            const sum = (data?.rows ?? [])
                .flatMap(manager =>
                    manager.rows.filter(
                        row => row.indicator === teamRow.indicator,
                    ),
                )
                .reduce((total, row) => total + (row.fact ?? 0), 0);
            expect(teamRow.fact).toBe(sum);
        }
        expect(data?.team.find(row => row.indicator === 'sales')?.fact).toBe(9);
    });

    it('снимка plan нет — status ready, строки no-plan, причина plan-snapshot-missing', async () => {
        const { useCase } = makeUseCase({ plan: null });
        const result = await useCase.execute(request(), leader, NOW_CLOSED);
        expect(result.status).toBe('ready');
        expect(result.data?.reasons).toContain(
            AI_PLAN_FACT_REASONS.planSnapshotMissing,
        );
        expect(result.data?.reasonTexts[0]).toContain('Снимок целей');
        const rows = result.data?.rows[0].rows ?? [];
        expect(rows.every(row => row.status === 'no-plan')).toBe(true);
        expect(rows[0].reasons).toContain(PLAN_FACT_REASONS.planMissing);
        // Ни одного числа плана, темпа и прогноза наружу.
        expect(
            rows.every(
                row =>
                    row.plan === null &&
                    row.pace === null &&
                    row.forecastP50 === null,
            ),
        ).toBe(true);
    });

    it('месяцев менеджеров нет — причина manager-month-missing, не ошибка', async () => {
        const { useCase } = makeUseCase({ months: [] });
        const result = await useCase.execute(request(), leader, NOW_CLOSED);
        expect(result.status).toBe('ready');
        expect(result.data?.reasons).toContain(
            AI_PLAN_FACT_REASONS.monthSnapshotsMissing,
        );
    });

    it('daily_plan_enabled = false — не 403: perDayNeeded null с причиной', async () => {
        const { useCase } = makeUseCase({ dailyPlanEnabled: false });
        const result = await useCase.execute(request(), leader, NOW_LIVE);
        expect(result.status).toBe('ready');
        expect(result.data?.reasons).toContain(
            AI_PLAN_FACT_REASONS.dailyPlanDisabled,
        );
        const sales = result.data?.rows[0].rows.find(
            row => row.indicator === 'sales',
        );
        expect(sales?.perDayNeeded).toBeNull();
        expect(sales?.reasons).toContain(PLAN_FACT_REASONS.dailyPlanDisabled);
        expect(sales?.pace).not.toBeNull();
    });

    it('периметр: чужие строки не отдаются, свод отдела остаётся', async () => {
        const { useCase } = makeUseCase();
        const result = await useCase.execute(request(), limited, NOW_CLOSED);
        expect(result.data?.rows.map(row => row.managerId)).toEqual(['11']);
        expect(result.data?.team).toHaveLength(3);
    });

    it('явный managerIds вне периметра отбрасывается молча, ключ — по пересечению', async () => {
        const { useCase } = makeUseCase();
        const result = await useCase.execute(
            request({ managerIds: ['12', '11'] }),
            limited,
            NOW_CLOSED,
        );
        expect(result.requestKey).toBe(
            buildPlanFactKey(DOMAIN, MONTH, planFactUsersKey(['11'])),
        );
        expect(result.data?.rows.map(row => row.managerId)).toEqual(['11']);
    });

    it('без managerIds у видящего всех берётся ростер ОП портала', async () => {
        const { useCase, resolve } = makeUseCase({ roster: [11, 12, 13] });
        const result = await useCase.execute(request(), leader, NOW_CLOSED);
        expect(resolve).toHaveBeenCalledWith(DOMAIN);
        expect(result.requestKey).toBe(
            buildPlanFactKey(
                DOMAIN,
                MONTH,
                planFactUsersKey(['11', '12', '13']),
            ),
        );
    });

    it('порядок id в запросе не меняет ключ кэша', async () => {
        const first = await makeUseCase().useCase.execute(
            request({ managerIds: ['12', '11'] }),
            leader,
            NOW_CLOSED,
        );
        const second = await makeUseCase().useCase.execute(
            request({ managerIds: ['11', '12', '11'] }),
            leader,
            NOW_CLOSED,
        );
        expect(first.requestKey).toBe(second.requestKey);
    });
});
