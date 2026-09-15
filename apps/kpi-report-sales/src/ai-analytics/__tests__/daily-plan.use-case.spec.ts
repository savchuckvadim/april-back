import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import {
    DEFAULT_WORK_CALENDAR,
    enumerateWorkdays,
    lagCdfFromTable,
    maturityFloor,
    meanMaturity,
    requiredVolume,
    type ParamContext,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { buildResetPattern } from '../cache/cache-key.util';
import { AI_ANALYTICS_SETTINGS_RESET_SCOPES } from '../constants/ai-analytics.const';
import {
    AI_DAILY_PLAN_DISABLED_MESSAGE,
    AI_DAILY_PLAN_REASONS,
    AI_DAILY_PLAN_STEP_ORDER,
    AI_DAILY_PLAN_TTL_SECONDS,
    AI_DAILY_PLAN_UNREACHABLE,
    buildDailyPlanKey,
} from '../constants/ai-plan.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { buildForecastPayload } from '../domain/assembler/forecast.assembler';
import type { ForecastBuildInput } from '../domain/assembler/forecast.types';
import type { AiModelParams } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import type { ManagerMonthPayload } from '../domain/assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import { DailyPlanUseCase } from '../domain/use-cases/daily-plan.use-case';
import type { AiDailyPlanDto } from '../dto/ai-daily-plan.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';
import { dependenciesOf } from './fixtures/module-di.util';

/**
 * Ручка плана дня (план Фазы 2, поток 17 `p2-api-plan-daily`).
 *
 * Прогноз дня в фикстурах строится ТОЙ ЖЕ функцией, что и ночным шагом
 * конвейера (`buildForecastPayload`), поэтому числа в ожиданиях выведены
 * формулой библиотеки, а не подобраны руками.
 */
const DOMAIN = 'a.bitrix24.ru';
const DAY = '2026-09-08';
const MONTH = '2026-09';
const MANAGER = '11';
const EDGE = 'call_to_presentation';
const SECOND_EDGE = 'presentation_to_offer';
const CALENDAR: WorkCalendar = { ...DEFAULT_WORK_CALENDAR, holidays: [] };
const REGISTRY: ParamContext = {};

const leader: RequesterAccess = { role: 'op', visibleManagerIds: null };
const manager: RequesterAccess = {
    role: 'manager',
    visibleManagerIds: [MANAGER],
};

/** Рабочие дни сентября 2026 — независимая опора ожиданий (функция lib). */
const WORKDAYS = enumerateWorkdays(`${MONTH}-01`, `${MONTH}-30`, CALENDAR);
const DAYS = {
    total: WORKDAYS.length,
    elapsed: WORKDAYS.filter(day => day < DAY).length,
    left: WORKDAYS.filter(day => day >= DAY).length,
};

/** Модель портала: два ребра воронки, шкала лага и стадийная θ. */
function modelPayload(
    overrides: Partial<PortalModelPayload> = {},
): PortalModelPayload {
    return {
        monthKey: MONTH,
        window: [MONTH],
        observations: 1,
        managers: 1,
        edges: [
            {
                edge: EDGE,
                mu: 0.2,
                n: 500,
                kappa: 30,
                layer: 'portal',
                managers: 3,
                kappaSource: 'default',
                kappaKind: 'late',
                kappaGateOpen: false,
                rho: null,
                homogeneous: false,
            },
            {
                edge: SECOND_EDGE,
                mu: 0.5,
                n: 100,
                kappa: 30,
                layer: 'portal',
                managers: 3,
                kappaSource: 'default',
                kappaKind: 'late',
                kappaGateOpen: false,
                rho: null,
                homogeneous: false,
            },
        ],
        managerNorms: [
            {
                managerId: MANAGER,
                tenureBand: '6-18',
                edges: [
                    {
                        edge: EDGE,
                        mu: 0.2,
                        layer: 'portal',
                        n: 400,
                        w: 1,
                        kappa: 30,
                    },
                    {
                        edge: SECOND_EDGE,
                        mu: 0.5,
                        layer: 'portal',
                        n: 80,
                        w: 1,
                        kappa: 30,
                    },
                ],
            },
        ],
        kappa: 30,
        overdispersion: { value: 2.5, source: 'default' },
        mS: 10,
        msSource: 'default',
        msGroups: 0,
        sRef: 7,
        sRefSource: 'default',
        cap: 25,
        capSource: 'default',
        capActivity: 'call',
        cycleMedianDays: 28,
        lagCdf: {
            kind: 'exponential',
            medianDays: 28,
            n: 0,
            points: [
                { days: 7, value: 0.16 },
                { days: 14, value: 0.29 },
                { days: 28, value: 0.5 },
                { days: 60, value: 0.77 },
            ],
        },
        stageTheta: [
            {
                stageCode: 'sales_in_progress',
                order: 8,
                n: 40,
                s: 6,
                value: 0.15,
                w: 0.5,
                ci90: null,
            },
        ],
        chainSharePct: 85,
        edgeKind: 'prob',
        edgeKindReason: 'chain-entered',
        betaSource: 'none',
        betaCountdown: null,
        season: { index: 1, source: 'default', note: 'Сезонность не оценена' },
        readiness: {
            mode: 'descriptive',
            historyMonths: 6,
            presentations: 300,
            sales: 20,
            comparableFrom: '',
            reasons: [],
        },
        sanity: null,
        events: [],
        detectedEvents: [],
        reused: false,
        reusedReason: null,
        signature: {
            rubricVersion: null,
            scriptHash: null,
            priceMedian: null,
        },
        meta: {
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
            comparableFrom: null,
            generatedAt: '2026-09-01T01:00:00.000Z',
            modelSnapshotId: null,
        },
        ...overrides,
    };
}

/** Вход ночного прогноза: цель 6, закрыто 2, один открытый эпизод. */
function forecastInput(
    overrides: {
        model?: PortalModelPayload;
        hasStageHistory?: boolean;
    } = {},
): ForecastBuildInput {
    const model = overrides.model ?? modelPayload();

    return {
        day: DAY,
        monthKey: MONTH,
        workdaysInMonth: DAYS.total,
        daysElapsed: DAYS.elapsed,
        daysLeft: DAYS.left,
        model,
        modelSnapshotId: 'ais-model-1',
        hasStageHistory: overrides.hasStageHistory ?? true,
        registry: REGISTRY,
        manager: {
            managerId: MANAGER,
            doneSales: 2,
            entryDone: 200,
            planHead: 6,
            override: null,
            levelTarget: null,
            lastMonthSales: 4,
            openEpisodes: [{ id: 'deal-1', ageDays: 10, theta: 0.15 }],
            edges: [
                { edge: EDGE, n: 200, s: 40 },
                { edge: SECOND_EDGE, n: 40, s: 18 },
            ],
            norms: model.managerNorms[0],
        },
        seed: 7,
        meta: {
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
            comparableFrom: null,
            generatedAt: '2026-09-08T01:00:00.000Z',
            modelSnapshotId: 'ais-model-1',
        },
    };
}

/** Месяц менеджера в объёме, который читает план дня. */
function monthPayload(
    overrides: Partial<ManagerMonthPayload> = {},
): Partial<ManagerMonthPayload> {
    return {
        level: 'middle',
        edges: [
            {
                edge: EDGE,
                n: 200,
                s: 40,
                estimand: 'prob',
                mixedSources: false,
            },
            {
                edge: SECOND_EDGE,
                n: 40,
                s: 18,
                estimand: 'prob',
                mixedSources: false,
            },
        ],
        planSnapshot: { sales: 6, calls: 400, presentations: 80 },
        ...overrides,
    };
}

interface Harness {
    access?: RequesterAccess;
    forecast?: unknown;
    model?: unknown;
    month?: unknown;
    dailyPlanEnabled?: boolean;
    cached?: unknown;
    /** Слой портала реестра (ai_analytics_model_params). */
    modelParams?: AiModelParams;
}

/** Сценарий с моками стора, кэша и настроек; PBXService не нужен вовсе. */
function makeUseCase(options: Harness = {}) {
    const findByKeys = jest.fn().mockResolvedValue(
        options.forecast === undefined
            ? []
            : [
                  {
                      id: 'ais-forecast-1',
                      periodKey: DAY,
                      managerId: MANAGER,
                      payload: options.forecast,
                  },
              ],
    );
    const latestModel = jest.fn().mockResolvedValue(
        options.model === undefined
            ? null
            : {
                  id: 'ais-model-1',
                  periodKey: MONTH,
                  managerId: null,
                  payload: options.model,
              },
    );
    const findManagerMonths = jest.fn().mockResolvedValue(
        options.month === undefined
            ? []
            : [
                  {
                      id: 'ais-month-1',
                      periodKey: MONTH,
                      managerId: MANAGER,
                      payload: options.month,
                  },
              ],
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
        ...(options.modelParams === undefined
            ? {}
            : { modelParams: options.modelParams }),
    });
    const access = new RequesterAccessService(
        {} as never,
        {} as never,
        settings,
    );
    const useCase = new DailyPlanUseCase(
        settings,
        access,
        { remember } as never,
        { findByKeys, latestModel, findManagerMonths } as never,
    );

    return {
        useCase,
        remember,
        findByKeys,
        latestModel,
        findManagerMonths,
    };
}

const request = (managerId = MANAGER) => ({
    domain: DOMAIN,
    requesterUserId: '447',
    managerId,
    date: DAY,
});

/** Полный сценарий: прогноз, модель и месяц на месте. */
async function planOf(
    access: RequesterAccess,
    overrides: Harness = {},
): Promise<AiDailyPlanDto> {
    const { useCase } = makeUseCase({
        forecast: buildForecastPayload(forecastInput()),
        model: modelPayload(),
        month: monthPayload(),
        ...overrides,
    });
    const response = await useCase.execute(request(), access);
    expect(response.status).toBe('ready');
    expect(response.data).toBeDefined();

    return response.data as AiDailyPlanDto;
}

describe('DailyPlanUseCase — план дня (поток 17)', () => {
    it('менеджеру отдаёт план без ropOnly, руководителю — с ropOnly', async () => {
        const forManager = await planOf(manager);
        const forLeader = await planOf(leader);

        expect(forManager.ropOnly).toBeUndefined();
        expect(forManager.items.length).toBeGreaterThan(0);
        expect(forLeader.ropOnly).toBeDefined();
        expect(forLeader.ropOnly?.betaSource).toBe('none');
        // Числа плана от роли не зависят — режется только служебный блок.
        expect(forLeader.items).toEqual(forManager.items);
    });

    it('чужой managerId вне периметра — 403', async () => {
        const { useCase } = makeUseCase({
            forecast: buildForecastPayload(forecastInput()),
            model: modelPayload(),
            month: monthPayload(),
        });

        await expect(
            useCase.execute({ ...request('12'), managerId: '12' }, manager),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('при выключенной ai_analytics_daily_plan_enabled — 403 с текстом', async () => {
        const { useCase, findByKeys } = makeUseCase({
            dailyPlanEnabled: false,
            forecast: buildForecastPayload(forecastInput()),
        });

        await expect(useCase.execute(request(), leader)).rejects.toThrow(
            AI_DAILY_PLAN_DISABLED_MESSAGE,
        );
        await expect(useCase.execute(request(), leader)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(findByKeys).not.toHaveBeenCalled();
    });

    it('кэширует план на 180 с ключом {domain}:plan:{date}:{managerId}', async () => {
        const { useCase, remember } = makeUseCase({
            forecast: buildForecastPayload(forecastInput()),
            model: modelPayload(),
            month: monthPayload(),
        });

        const response = await useCase.execute(request(), leader);
        const key = buildDailyPlanKey(DOMAIN, DAY, MANAGER);

        expect(response.requestKey).toBe(key);
        expect(remember).toHaveBeenCalledWith(
            key,
            AI_DAILY_PLAN_TTL_SECONDS,
            expect.any(Function),
        );
        // Ключ попадает под общий паттерн сброса секции plan, а сама
        // секция уже входит в список сброса settings/save — значит,
        // сохранение настроек чистит планы дня без отдельного кода.
        expect(AI_ANALYTICS_SETTINGS_RESET_SCOPES).toContain('plan');
        expect(
            key.startsWith(buildResetPattern(DOMAIN, 'plan').slice(0, -1)),
        ).toBe(true);
    });

    it('explanation.steps идёт по порядку G → Y₀ → λ_pipe → N_req → разворот → потолок', async () => {
        const dto = await planOf(leader);

        expect(dto.explanation.steps.map(step => step.code)).toEqual([
            ...AI_DAILY_PLAN_STEP_ORDER,
        ]);
        const numbers = new Set<number>([
            dto.target.sales,
            dto.doneSales,
            dto.daysLeft,
            ...dto.items.flatMap(item => [
                item.requiredToday,
                item.doneToday,
                item.monthPlan,
                item.monthDone,
            ]),
        ]);
        if (dto.pipelineExpected !== null) numbers.add(dto.pipelineExpected);
        if (dto.requiredVolume !== null) numbers.add(dto.requiredVolume);
        const outside = dto.explanation.steps.filter(
            step => step.value !== null && !numbers.has(step.value),
        );
        expect(outside).toEqual([]);
        expect(dto.explanation.text).toContain('Цель месяца');
    });

    it('шаги воспроизводят расчёт: G, Y₀, λ_pipe и N_req равны числам прогноза', async () => {
        const payload = buildForecastPayload(forecastInput());
        const dto = await planOf(leader, { forecast: payload });
        const byCode = new Map(
            dto.explanation.steps.map(step => [step.code, step.value]),
        );

        expect(byCode.get('target')).toBe(payload.target.value);
        expect(byCode.get('done_sales')).toBe(payload.doneSales);
        expect(byCode.get('pipeline_expected')).toBe(payload.pipelineExpected);
        expect(byCode.get('required_volume')).toBe(payload.requiredVolume);
        expect(dto.requiredVolume).toBe(payload.requiredVolume);
    });

    it('план дня не выше потолка plan_day_ceiling × план месяца ÷ рабочие дни', async () => {
        const dto = await planOf(leader);
        const ceilingMultiplier = 1.5;

        expect(dto.items.length).toBeGreaterThan(0);
        for (const item of dto.items) {
            const ceiling = (ceilingMultiplier * item.monthPlan) / DAYS.total;
            expect(item.requiredToday).toBeLessThanOrEqual(ceiling + 1e-9);
        }
    });

    it('без истории стадий pipelineExpected = null, а цель на пайплайн не уменьшается', async () => {
        const withHistory = buildForecastPayload(forecastInput());
        const without = buildForecastPayload(
            forecastInput({ hasStageHistory: false }),
        );
        const dto = await planOf(leader, { forecast: without });
        const full = await planOf(leader, { forecast: withHistory });

        expect(dto.pipelineExpected).toBeNull();
        expect(full.pipelineExpected).not.toBeNull();
        expect(dto.target.sales).toBe(full.target.sales);
        // N_req без пайплайна строго больше: остаток цели не уменьшали.
        expect(full.requiredVolume).not.toBeNull();
        expect(dto.requiredVolume).toBeGreaterThan(full.requiredVolume ?? 0);
        expect(dto.requiredVolume).toBeCloseTo(
            requiredVolume({
                target: dto.target.sales,
                doneSales: dto.doneSales,
                pipeline: null,
                conversion: 0.2 * 0.5,
                fBar: expectedFBar(),
            }),
            6,
        );
    });

    it('в режиме betaSource none normAtRefQuality = null и качество не двигает items', async () => {
        const none = modelPayload();
        const hypothesis = modelPayload({ betaSource: 'hypothesis', sRef: 9 });
        const dtoNone = await planOf(leader, {
            forecast: buildForecastPayload(forecastInput({ model: none })),
            model: none,
        });
        const dtoHypothesis = await planOf(leader, {
            forecast: buildForecastPayload(
                forecastInput({ model: hypothesis }),
            ),
            model: hypothesis,
        });

        expect(dtoNone.ropOnly?.normAtRefQuality).toBeNull();
        expect(dtoHypothesis.ropOnly?.normAtRefQuality).toBeNull();
        expect(dtoNone.ropOnly?.sReq).toBeUndefined();
        expect(dtoHypothesis.items).toEqual(dtoNone.items);
    });

    it('при превышении cap выставляются bindingConstraint и unreachable', async () => {
        const narrow = modelPayload({ cap: 1 });
        const dto = await planOf(leader, {
            forecast: buildForecastPayload(forecastInput({ model: narrow })),
            model: narrow,
        });

        expect(dto.ropOnly?.bindingConstraint).toBe(EDGE);
        expect(dto.ropOnly?.unreachable).toBe(
            AI_DAILY_PLAN_UNREACHABLE.capExceeded,
        );
        expect(dto.ropOnly?.gCeiling).toBeLessThan(
            dto.ropOnly?.gExpected ?? Number.POSITIVE_INFINITY,
        );
    });

    it('без модели портала — деградация: план по объёму и код причины', async () => {
        const { useCase } = makeUseCase({ month: monthPayload() });

        const response = await useCase.execute(request(), leader);
        const dto = response.data as AiDailyPlanDto;

        expect(dto.reason).toBe(AI_DAILY_PLAN_REASONS.modelMissing);
        expect(dto.items.map(item => item.callType)).toEqual([
            EDGE,
            SECOND_EDGE,
        ]);
        // План по объёму: остаток месяца из снимка плана руководителя.
        const call = dto.items.find(item => item.callType === EDGE);
        expect(call?.monthPlan).toBe(400);
        expect(call?.requiredToday).toBeCloseTo(
            Math.min((400 - 200) / DAYS.left, (1.5 * 400) / DAYS.total),
            9,
        );
        expect(dto.ropOnly?.norm.value).toBeNull();
        expect(dto.ropOnly?.betaSource).toBe('none');
        expect(dto.explanation.text).toContain('Модель портала');
    });

    it('в деградации N_req не выдумывается: null и в DTO, и в шаге объяснения', async () => {
        const { useCase } = makeUseCase({ month: monthPayload() });

        const response = await useCase.execute(request(), leader);
        const dto = response.data as AiDailyPlanDto;
        const step = dto.explanation.steps.find(
            item => item.code === 'required_volume',
        );

        // Ноль здесь означал бы «делать нечего» — при непустом плане это
        // прямое противоречие: строки требуют активностей сегодня.
        expect(dto.requiredVolume).toBeNull();
        expect(step?.value).toBeNull();
        expect(step?.text).toContain('по объёму');
        expect(dto.items.some(item => item.requiredToday > 0)).toBe(true);
    });

    it('в деградации потолок дня берётся из plan_day_ceiling портала', async () => {
        // Месяц только начат (20 звонков из 400) — равномерный остаток
        // выше потолка дня, поэтому множитель реестра виден в числе.
        const month = monthPayload({
            edges: [
                {
                    edge: EDGE,
                    n: 20,
                    s: 4,
                    estimand: 'prob',
                    mixedSources: false,
                },
            ],
        });
        const dayOf = async (params?: AiModelParams): Promise<number> => {
            const { useCase } = makeUseCase({
                month,
                ...(params === undefined ? {} : { modelParams: params }),
            });
            const response = await useCase.execute(request(), leader);
            const dto = response.data as AiDailyPlanDto;

            return dto.items[0].requiredToday;
        };
        const evenly = (400 - 20) / DAYS.left;

        // Тот же множитель, что берёт ночной прогноз (forecast.plan.ts):
        // 1,0 вместо дефолтных 1,5 обязан опустить потолок дня и здесь.
        expect(await dayOf({ plan_day_ceiling: 1 })).toBeCloseTo(
            Math.min(evenly, (1 * 400) / DAYS.total),
            9,
        );
        expect(await dayOf()).toBeCloseTo(
            Math.min(evenly, (1.5 * 400) / DAYS.total),
            9,
        );
        expect(await dayOf({ plan_day_ceiling: 1 })).toBeLessThan(
            await dayOf(),
        );
    });

    it('ни одна ветка не зовёт PBXService и Битрикс', async () => {
        const { useCase, findByKeys, latestModel, findManagerMonths } =
            makeUseCase({
                forecast: buildForecastPayload(forecastInput()),
                model: modelPayload(),
                month: monthPayload(),
            });

        await useCase.execute(request(), leader);

        // Мок PBXService в сценарий не передать: его там нет в принципе —
        // проверяем это по самим зависимостям класса, а не по вызовам.
        expect(dependenciesOf(DailyPlanUseCase).map(dep => dep.name)).toEqual([
            'SettingsLoader',
            'RequesterAccessService',
            'AiAnalyticsCacheService',
            'AiAnalyticsSnapshotStore',
        ]);
        expect(findByKeys).toHaveBeenCalledTimes(1);
        expect(latestModel).toHaveBeenCalled();
        expect(findManagerMonths).toHaveBeenCalledTimes(1);
    });
});

/**
 * `F̄(D_rem)` по шкале лага фикстуры — считается примитивами библиотеки,
 * чтобы ожидание `N_req` в тесте было формулой, а не копией результата.
 */
function expectedFBar(): number {
    const model = modelPayload();

    return maturityFloor(
        meanMaturity(
            lagCdfFromTable(model.lagCdf.points, {
                kind: model.lagCdf.kind,
                n: model.lagCdf.n,
            }),
            DAYS.left,
        ),
    );
}
