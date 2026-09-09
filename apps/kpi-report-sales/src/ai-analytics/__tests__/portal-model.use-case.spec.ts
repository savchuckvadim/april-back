import 'reflect-metadata';
import {
    AI_ANALYTICS_PARAM_DEFAULTS,
    KAPPA_DEFAULTS,
    leaveOneOutNorm,
    paramsVersion,
    REGISTRY_VERSION,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import { AppCacheService } from '@lib/app-cache';
import type { JsonObject } from '@lib/sales-ai-analytics/params/index';
import { AI_PORTAL_MODEL_REASONS } from '../constants/ai-portal-model.const';
import { buildPortalNorms } from '../domain/assembler/portal-model.norms';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../domain/assembler/portal-model.types';
import type { PortalModelRecord } from '../domain/loaders/portal-model.loader';
import { PortalModelUseCase } from '../domain/use-cases/portal-model.use-case';
import { AiAnalyticsPortalModelModule } from '../portal-model/ai-analytics-portal-model.module';
import { ForecastStep } from '../steps/forecast.step';
import { PortalModelStep } from '../steps/portal-model.step';
import {
    exportsOf,
    metadataList,
    missingDependencies,
} from './fixtures/module-di.util';
import {
    portalSettings,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

/**
 * Месячная модель портала (план Фазы 2, поток 16a). Проверяется состав
 * снапшота, гибридная сила усадки до гейта Клейнмана, переиспользование
 * прошлой модели без данных, версия параметров, подпись сезона и
 * автособытие смены рубрики.
 */
const DOMAIN = 'a.bitrix24.ru';
const MONTH = '2026-09';
const NOW = new Date('2026-10-03T01:00:00Z');
const EDGE = 'call_to_presentation';
const SECOND_EDGE = 'presentation_to_offer';

/** Месяц менеджера в объёме, который читает модель портала. */
function month(
    managerId: string,
    monthKey: string,
    values: {
        s?: number;
        n?: number;
        band?: string | null;
        sales?: number;
        exclude?: boolean;
        score?: number;
    } = {},
): PortalManagerMonth {
    return {
        monthKey,
        managerId,
        tenureBand: values.band ?? '6-18',
        edges: [
            { edge: EDGE, n: values.n ?? 100, s: values.s ?? 20 },
            { edge: SECOND_EDGE, n: values.s ?? 20, s: 5 },
        ],
        excludeFromNorms: values.exclude === true,
        workedDays: 20,
        daysSource: 'calendar',
        callsDone: 400,
        presentations: values.s ?? 20,
        salesCount: values.sales ?? 3,
        averageCheck: 100_000,
        planSales: null,
        level: 'middle',
        score: { value: values.score ?? 7, n: 30 },
    };
}

/** Окно из шести месяцев по пяти менеджерам — гейт Клейнмана открыт. */
function window(months: number, managers: number): PortalManagerMonth[] {
    const keys = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', MONTH];
    return keys.slice(-months).flatMap(key =>
        Array.from({ length: managers }, (unused, index) =>
            month(String(11 + index), key, {
                s: 18 + index,
                n: 100 + index,
            }),
        ),
    );
}

type LoaderMock = {
    loadMonths: jest.Mock;
    latestModel: jest.Mock;
    loadModel: jest.Mock;
};

function makeUseCase(options: {
    months?: PortalManagerMonth[];
    previous?: PortalModelRecord | null;
    settings?: Parameters<typeof settingsLoaderWith>[0];
}): {
    useCase: PortalModelUseCase;
    loader: LoaderMock;
    upsert: jest.Mock;
    saveSettings: jest.Mock;
} {
    const loader: LoaderMock = {
        loadMonths: jest.fn().mockResolvedValue(options.months ?? []),
        latestModel: jest.fn().mockResolvedValue(options.previous ?? null),
        loadModel: jest.fn().mockResolvedValue(null),
    };
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-9', supersededIds: [] });
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const params = {
        load: jest.fn().mockResolvedValue({
            ctx: {},
            paramsVersion: 'pv-1',
            comparableFrom: '',
        }),
    };
    return {
        useCase: new PortalModelUseCase(
            settingsLoaderWith(options.settings ?? {}),
            params as never,
            loader as never,
            { upsert } as never,
            { savePortalSettings: saveSettings } as never,
        ),
        loader,
        upsert,
        saveSettings,
    };
}

/** Конверт первой записи — то, что сценарий положил в `ais`. */
function firstUpsert(upsert: jest.Mock): SnapshotEnvelope<PortalModelPayload> {
    const calls = upsert.mock.calls as SnapshotEnvelope<PortalModelPayload>[][];

    return calls[0][0];
}

/** Снапшот прошлой модели для проверок деградации и автособытий. */
function previousModel(
    payload: Partial<PortalModelPayload> = {},
): PortalModelRecord {
    return {
        id: 'ais-1',
        monthKey: '2026-08',
        payload: {
            monthKey: '2026-08',
            edges: [
                {
                    edge: EDGE,
                    mu: 0.2,
                    n: 500,
                    kappa: 30,
                    layer: 'portal',
                    managers: 5,
                    kappaSource: 'default',
                    kappaKind: 'late',
                    kappaGateOpen: false,
                    rho: null,
                    homogeneous: false,
                },
            ],
            observations: 5,
            reused: false,
            ...payload,
        } as Partial<PortalModelPayload>,
    };
}

describe('PortalModelUseCase — состав месячного снапшота', () => {
    it('пишет нормы, κ с источником, φ, m_S, S_ref, cap, цикл, θ, готовность', async () => {
        const { useCase, upsert } = makeUseCase({ months: window(6, 5) });

        const result = await useCase.execute(
            {
                domain: DOMAIN,
                monthKey: MONTH,
                facts: {
                    paramsVersion: 'pv-42',
                    cycleMedianDays: 24,
                    chainSharePct: 85,
                    edgeKind: 'prob',
                    edgeKindReason: 'chain-entered',
                    historyMonths: 8,
                    stageThetas: [
                        {
                            stageCode: 'sales_in_progress',
                            order: 8,
                            n: 40,
                            s: 6,
                            censored: 2,
                            value: 0.15,
                            w: 0.5,
                            n_: 0,
                        } as never,
                    ],
                    sanity: {
                        day: '2026-10-03',
                        weekKey: '2026-W40',
                        generatedAt: NOW.toISOString(),
                        rules: [],
                        warnings: ['цель оторвана от факта'],
                    },
                },
            },
            NOW,
        );

        const payload = result.payload as PortalModelPayload;
        expect(result.written).toBe(1);
        expect(payload.edges.map(edge => edge.edge)).toEqual([
            EDGE,
            SECOND_EDGE,
        ]);
        expect(payload.edges[0].mu).toBeGreaterThan(0);
        expect(payload.edges[0].kappa).toBeGreaterThan(0);
        expect(payload.edges[0].kappaSource).toBe('kleinman');
        expect(payload.overdispersion).toEqual({
            value: AI_ANALYTICS_PARAM_DEFAULTS.overdispersion_default,
            source: 'default',
        });
        expect(payload.mS).toBe(AI_ANALYTICS_PARAM_DEFAULTS.m_s_default);
        expect(payload.msSource).toBe('default');
        expect(payload.sRef).toBe(7);
        expect(payload.cap).toBeGreaterThan(0);
        expect(payload.cycleMedianDays).toBe(24);
        expect(payload.stageTheta[0]).toMatchObject({
            stageCode: 'sales_in_progress',
            value: 0.15,
        });
        expect(payload.readiness.mode).toBeDefined();
        expect(payload.betaSource).toBe('none');
        expect(payload.betaCountdown?.presentationsLeft).toBeGreaterThan(0);
        expect(payload.sanity?.warnings).toEqual(['цель оторвана от факта']);
        expect(payload.chainSharePct).toBe(85);
        expect(payload.edgeKind).toBe('prob');
        expect(firstUpsert(upsert)).toMatchObject({
            type: 'ai-analytics-portal-model',
            periodKey: MONTH,
            managerId: null,
            paramsVersion: 'pv-42',
        });
    });

    it('нормы менеджеров лежат в снапшоте: витрина их читает, а не считает', async () => {
        const months = window(6, 5);
        const { useCase } = makeUseCase({ months });

        const result = await useCase.execute(
            { domain: DOMAIN, monthKey: MONTH, facts: { paramsVersion: 'pv' } },
            NOW,
        );

        const payload = result.payload as PortalModelPayload;
        expect(payload.managerNorms).toHaveLength(5);
        expect(payload.managerNorms[0].edges.map(edge => edge.edge)).toEqual([
            EDGE,
            SECOND_EDGE,
        ]);
    });
});

describe('buildPortalNorms — один проход против leaveOneOutNorm', () => {
    it('нормы совпадают с библиотечным leave-one-out по каждому менеджеру', () => {
        const months = window(6, 5);
        const norms = buildPortalNorms({
            months,
            windowMonths: 6,
            registry: {},
        });
        const cells = [...new Set(months.map(item => item.managerId))].map(
            managerId => {
                const own = months.filter(item => item.managerId === managerId);
                return {
                    managerId,
                    tenureBand: own[0].tenureBand,
                    s: own.reduce(
                        (sum, item) =>
                            sum +
                            (item.edges.find(edge => edge.edge === EDGE)?.s ??
                                0),
                        0,
                    ),
                    n: own.reduce(
                        (sum, item) =>
                            sum +
                            (item.edges.find(edge => edge.edge === EDGE)?.n ??
                                0),
                        0,
                    ),
                };
            },
        );

        for (const manager of norms.managerNorms) {
            const expected = leaveOneOutNorm({
                cells,
                managerId: manager.managerId,
                tenureBand: manager.tenureBand,
            });
            const own = manager.edges.find(edge => edge.edge === EDGE);
            expect(own?.mu).toBeCloseTo(expected.value, 12);
            expect(own?.layer).toBe(expected.layer);
            expect(own?.n).toBe(expected.n);
        }
    });
});

describe('PortalModelUseCase — штатная деградация', () => {
    it('гейт Клейнмана не пройден: κ = 100/30 из настройки с источником default', async () => {
        const early = makeUseCase({ months: window(2, 3) });
        const late = makeUseCase({ months: window(4, 3) });

        const first = await early.useCase.execute(
            { domain: DOMAIN, monthKey: MONTH },
            NOW,
        );
        const second = await late.useCase.execute(
            { domain: DOMAIN, monthKey: MONTH },
            NOW,
        );

        const firstEdge = (first.payload as PortalModelPayload).edges[0];
        const secondEdge = (second.payload as PortalModelPayload).edges[0];
        expect(firstEdge.kappa).toBe(KAPPA_DEFAULTS.edgeEarly);
        expect(firstEdge.kappaSource).toBe('default');
        expect(firstEdge.kappaGateOpen).toBe(false);
        expect(secondEdge.kappa).toBe(KAPPA_DEFAULTS.edgeLate);
        expect(secondEdge.kappaSource).toBe('default');
    });

    it('данных нет: переиспользуется прошлый снапшот с пометкой и причиной', async () => {
        const { useCase, upsert } = makeUseCase({
            months: [],
            previous: previousModel(),
        });

        const result = await useCase.execute(
            { domain: DOMAIN, monthKey: MONTH },
            NOW,
        );

        expect(result.reused).toBe(true);
        expect(result.reason).toBe(AI_PORTAL_MODEL_REASONS.reusedPrevious);
        expect(result.payload?.monthKey).toBe(MONTH);
        expect(result.payload?.reusedReason).toBe(
            AI_PORTAL_MODEL_REASONS.monthsMissing,
        );
        expect(upsert).toHaveBeenCalledTimes(1);
    });

    it('нет ни данных, ни прошлой модели: запись не создаётся', async () => {
        const { useCase, upsert } = makeUseCase({ months: [], previous: null });

        const result = await useCase.execute(
            { domain: DOMAIN, monthKey: MONTH },
            NOW,
        );

        expect(result.payload).toBeNull();
        expect(result.written).toBe(0);
        expect(result.reason).toBe(AI_PORTAL_MODEL_REASONS.monthsMissing);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('сезонный индекс равен единице и едет с подписью «не оценён»', async () => {
        const { useCase } = makeUseCase({ months: window(6, 5) });

        const result = await useCase.execute(
            { domain: DOMAIN, monthKey: MONTH },
            NOW,
        );

        expect(result.payload?.season).toEqual({
            index: 1,
            source: 'default',
            note: 'Сезонность не оценена: индекс 1,0',
        });
    });
});

describe('PortalModelUseCase — версия параметров и журнал событий', () => {
    it('версия меняется при смене настроек и не меняется при перестановке ключей', () => {
        const base = {
            globalDefaults: AI_ANALYTICS_PARAM_DEFAULTS as JsonObject,
            portalParams: { kappa_edge_late: 30, f_min: 0.1 } as JsonObject,
            registryVersion: REGISTRY_VERSION,
        };
        const reordered = {
            registryVersion: REGISTRY_VERSION,
            portalParams: { f_min: 0.1, kappa_edge_late: 30 } as JsonObject,
            globalDefaults: AI_ANALYTICS_PARAM_DEFAULTS as JsonObject,
        };
        const changed = {
            ...base,
            portalParams: { kappa_edge_late: 45, f_min: 0.1 } as JsonObject,
        };

        expect(paramsVersion(reordered)).toBe(paramsVersion(base));
        expect(paramsVersion(changed)).not.toBe(paramsVersion(base));
    });

    it('смена версии рубрики даёт автособытие rubric_change с датой', async () => {
        const { useCase, saveSettings } = makeUseCase({
            months: window(6, 5),
            previous: previousModel({
                signature: {
                    rubricVersion: 'sections-7-v1',
                    scriptHash: null,
                    priceMedian: 100_000,
                },
            }),
        });

        const result = await useCase.execute(
            {
                domain: DOMAIN,
                monthKey: MONTH,
                facts: { rubricVersion: 'sections-8-v2' },
            },
            NOW,
        );

        expect(result.payload?.detectedEvents).toEqual([
            {
                date: '2026-09-30',
                kind: 'rubric_change',
                note: 'Версия рубрики: sections-7-v1 → sections-8-v2',
                source: 'auto',
            },
        ]);
        expect(result.payload?.events).toHaveLength(1);
        expect(saveSettings).toHaveBeenCalledWith(DOMAIN, {
            events: expect.stringContaining('rubric_change') as string,
        });
    });

    it('журнал уже знает событие — повтор его не дублирует', async () => {
        const { useCase, saveSettings } = makeUseCase({
            months: window(6, 5),
            previous: previousModel({
                signature: {
                    rubricVersion: 'sections-7-v1',
                    scriptHash: null,
                    priceMedian: null,
                },
            }),
            settings: {
                ...portalSettings({
                    events: [
                        {
                            date: '2026-09-30',
                            kind: 'rubric_change',
                            note: 'уже отмечено',
                            source: 'auto',
                        },
                    ],
                }),
            },
        });

        const result = await useCase.execute(
            {
                domain: DOMAIN,
                monthKey: MONTH,
                facts: { rubricVersion: 'sections-8-v2' },
            },
            NOW,
        );

        expect(result.payload?.detectedEvents).toEqual([]);
        expect(saveSettings).not.toHaveBeenCalled();
    });
});

describe('AiAnalyticsPortalModelModule — срез собирается', () => {
    it('зависимости провайдеров доступны в модуле, контроллеров нет', () => {
        expect(
            missingDependencies(AiAnalyticsPortalModelModule, [
                AppCacheService,
            ]),
        ).toEqual([]);
        expect(
            metadataList(AiAnalyticsPortalModelModule, 'controllers'),
        ).toEqual([]);
    });

    it('шаги экспортируются наружу — сборка соберёт из них массив', () => {
        const exported = exportsOf(AiAnalyticsPortalModelModule);

        expect(exported.has(PortalModelStep)).toBe(true);
        expect(exported.has(ForecastStep)).toBe(true);
    });
});
