import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEFAULT_WORK_CALENDAR,
} from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    isForecastBacktestSnapshot,
    isPoolSnapshot,
    isQualityLinkSnapshot,
    isRecommendationEffectSnapshot,
    phase4PayloadOf,
} from '../domain/assembler/phase4-snapshot.guards';
import {
    AI_PORTAL_PHI_WEEKS,
    Phase4SnapshotsLoader,
    weekPointsOf,
    workdaysOfWeek,
} from '../domain/loaders/phase4-snapshots.loader';
import {
    portalPhase4FactsOf,
    portalReadinessFactsOf,
} from '../domain/use-cases/portal-model.inputs';
import { phase4BusFactsOf } from '../steps/portal-model.facts';
import { portalModelFacts } from '../steps/portal-model.step';
import { createStepBus } from '../steps/step.types';
import { portalSettings } from './fixtures/lite-row.fixture';
import {
    backtestSnapshot,
    effectSnapshot,
    poolSnapshot,
    qualityLinkSnapshot,
} from './fixtures/phase4-snapshots.fixture';

/**
 * Чтение снапшотов Фазы 4 для модели портала и витрины: структурные
 * проверки нагрузок, «последние» по типам с деградацией по одному типу,
 * недельные точки сверхдисперсии, входы из шины и источник календаря.
 */
const DOMAIN = 'a.bitrix24.ru';

/** Согласие на пул, действующее с начала года. */
const CONSENT = { poolOptIn: true, poolConsentAt: '2026-01-10' };

const record = (payload: unknown, extra: Record<string, unknown> = {}) => ({
    id: 'ais-1',
    domain: DOMAIN,
    managerId: null,
    periodKey: '2026-09',
    payload,
    ...extra,
});

describe('phase4-snapshot.guards: чужая форма — null', () => {
    it('узнаёт свои нагрузки', () => {
        expect(isQualityLinkSnapshot(qualityLinkSnapshot())).toBe(true);
        expect(isPoolSnapshot(poolSnapshot())).toBe(true);
        expect(isForecastBacktestSnapshot(backtestSnapshot())).toBe(true);
        expect(isRecommendationEffectSnapshot(effectSnapshot())).toBe(true);
    });

    it('отбрасывает чужие и неполные', () => {
        expect(isQualityLinkSnapshot({ status: 'published' })).toBe(false);
        expect(isPoolSnapshot({ ...poolSnapshot(), status: 'x' })).toBe(false);
        expect(isForecastBacktestSnapshot(null)).toBe(false);
        expect(
            isRecommendationEffectSnapshot({ ...effectSnapshot(), gate: {} }),
        ).toBe(false);
    });

    it('понимает нагрузку и запись { payload }', () => {
        const pool = poolSnapshot();
        expect(phase4PayloadOf(pool, isPoolSnapshot)).toBe(pool);
        expect(
            phase4PayloadOf({ id: '1', payload: pool }, isPoolSnapshot),
        ).toBe(pool);
        expect(phase4PayloadOf({ payload: 1 }, isPoolSnapshot)).toBeNull();
    });
});

describe('Phase4SnapshotsLoader.loadLatest', () => {
    it('последние по четырём типам; сбой или чужая форма — null для типа', async () => {
        const findByKeys = jest.fn((domain: string, type: string) => {
            switch (type) {
                case AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest:
                    // Догон записал старый месяц последним — берётся свежий.
                    return Promise.resolve([
                        record(backtestSnapshot()),
                        record(
                            { ...backtestSnapshot(), shadowMonths: 1 },
                            { id: 'ais-old', periodKey: '2025-10' },
                        ),
                    ]);
                case AI_ANALYTICS_SNAPSHOT_TYPE.recommendationEffect:
                    return Promise.reject(new Error('ais недоступна'));
                case AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink:
                    return Promise.resolve([record({ status: 'чужое' })]);
                default:
                    return Promise.resolve([]);
            }
        });
        const loader = new Phase4SnapshotsLoader({ findByKeys } as never);

        const result = await loader.loadLatest(DOMAIN);

        expect(result.forecastBacktest?.shadowMonths).toBe(10);
        expect(result.recommendationEffect).toBeNull();
        expect(result.qualityLink).toBeNull();
        expect(result.pool).toBeNull();
        expect(findByKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.pool,
            expect.objectContaining({ managerIds: [null], latestOnly: true }),
        );
    });
});

describe('Phase4SnapshotsLoader.loadForMonth', () => {
    it('ступени — не позже месяца модели, связь и пул — за сам месяц', async () => {
        const findByKeys = jest.fn(
            (
                domain: string,
                type: string,
                filter: { periodKeys: readonly string[] },
            ) => {
                const keys = new Set(filter.periodKeys);
                const rows = {
                    [AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest]: [
                        record(backtestSnapshot({ shadowMonths: 7 }), {
                            periodKey: '2026-07',
                        }),
                        record(backtestSnapshot({ shadowMonths: 8 }), {
                            periodKey: '2026-08',
                        }),
                        // Догон записал будущий месяц — модель августа его не видит.
                        record(backtestSnapshot({ shadowMonths: 11 }), {
                            periodKey: '2026-10',
                        }),
                    ],
                    [AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink]: [
                        record(qualityLinkSnapshot({ monthKey: '2026-09' }), {
                            periodKey: '2026-09',
                        }),
                    ],
                }[type];

                return Promise.resolve(
                    (rows ?? []).filter(row => keys.has(row.periodKey)),
                );
            },
        );
        const loader = new Phase4SnapshotsLoader({ findByKeys } as never);

        const result = await loader.loadForMonth(DOMAIN, '2026-08');

        expect(result.forecastBacktest?.shadowMonths).toBe(8);
        expect(result.qualityLink).toBeNull();
        expect(result.pool).toBeNull();
        expect(result.recommendationEffect).toBeNull();
        expect(findByKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.pool,
            { periodKeys: ['2026-08'], managerIds: [null], latestOnly: true },
        );
    });

    it('сбой стора по типу — null только для него', async () => {
        const findByKeys = jest.fn(() =>
            Promise.reject(new Error('ais недоступна')),
        );
        const loader = new Phase4SnapshotsLoader({ findByKeys } as never);

        await expect(loader.loadForMonth(DOMAIN, '2026-08')).resolves.toEqual({
            forecastBacktest: null,
            recommendationEffect: null,
            qualityLink: null,
            pool: null,
        });
    });
});

describe('Phase4SnapshotsLoader.loadWeeklyActivity', () => {
    it('полгода недель по ключам, точки менеджер × тип, пустые недели отброшены', async () => {
        const findByKeys = jest.fn().mockResolvedValue([
            record(
                {
                    byType: [
                        { callType: 'cold', n: 12 },
                        { callType: 'presentation', n: 3 },
                        { callType: 7, n: 1 },
                    ],
                },
                { managerId: '11', periodKey: '2026-W38' },
            ),
            record({ byType: [] }, { managerId: null, periodKey: '2026-W38' }),
        ]);
        const loader = new Phase4SnapshotsLoader({ findByKeys } as never);

        const points = await loader.loadWeeklyActivity(
            DOMAIN,
            '2026-09',
            DEFAULT_WORK_CALENDAR,
        );

        const [, type, filter] = findByKeys.mock.calls[0] as [
            string,
            string,
            { periodKeys: string[]; latestOnly: boolean },
        ];
        expect(type).toBe(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek);
        expect(filter.latestOnly).toBe(true);
        expect(filter.periodKeys).toHaveLength(AI_PORTAL_PHI_WEEKS);
        expect(filter.periodKeys[AI_PORTAL_PHI_WEEKS - 1]).toBe('2026-W40');
        expect(points).toEqual([
            { count: 12, exposure: 5, cellKey: '11:cold' },
            { count: 3, exposure: 5, cellKey: '11:presentation' },
        ]);
    });

    it('сбой стора — пусто (φ по реестру)', async () => {
        const loader = new Phase4SnapshotsLoader({
            findByKeys: jest.fn().mockRejectedValue(new Error('x')),
        } as never);
        await expect(
            loader.loadWeeklyActivity(DOMAIN, '2026-09', DEFAULT_WORK_CALENDAR),
        ).resolves.toEqual([]);
    });

    it('рабочие дни недели — по календарю портала', () => {
        expect(workdaysOfWeek('2026-W38', DEFAULT_WORK_CALENDAR)).toBe(5);
        expect(
            workdaysOfWeek('2026-W38', {
                ...DEFAULT_WORK_CALENDAR,
                holidays: ['2026-09-14'],
            }),
        ).toBe(4);
        expect(
            weekPointsOf('1', { byType: [{ callType: 'x', n: 1 }] }, 0),
        ).toEqual([]);
    });
});

describe('Входы модели портала Фазы 4', () => {
    it('шина первична; ключа нет — стор (связь только за тот же месяц)', () => {
        const stored = {
            forecastBacktest: backtestSnapshot(),
            recommendationEffect: null,
            qualityLink: qualityLinkSnapshot({ monthKey: '2026-08' }),
            pool: poolSnapshot(),
        };
        const fromStore = portalPhase4FactsOf(
            {},
            '2026-09',
            stored,
            [],
            CONSENT,
        );
        expect(fromStore.qualityLink).toBeNull();
        expect(fromStore.pool).toBe(stored.pool);
        expect(fromStore.forecastBacktest).toBe(stored.forecastBacktest);

        const sameMonth = portalPhase4FactsOf(
            {},
            '2026-08',
            stored,
            [],
            CONSENT,
        );
        expect(sameMonth.qualityLink).toBe(stored.qualityLink);
        // Пул другого месяца из стора не берётся.
        expect(sameMonth.pool).toBeNull();

        const fromBus = portalPhase4FactsOf(
            { qualityLink: null, pool: null, calendarSource: 'import' },
            '2026-08',
            stored,
            [],
            CONSENT,
        );
        expect(fromBus).toMatchObject({
            qualityLink: null,
            pool: null,
            calendarSource: 'import',
        });
    });

    it('пул только при согласии, действующем к концу месяца модели', () => {
        const stored = {
            forecastBacktest: null,
            recommendationEffect: null,
            qualityLink: null,
            pool: poolSnapshot(),
        };
        const facts = (consent: {
            poolOptIn: boolean;
            poolConsentAt: string | null;
        }) => portalPhase4FactsOf({}, '2026-09', stored, [], consent).pool;

        expect(facts(CONSENT)).toBe(stored.pool);
        // Согласие отозвано — старая копия пула в ais не применяется.
        expect(facts({ poolOptIn: false, poolConsentAt: null })).toBeNull();
        expect(
            facts({ poolOptIn: false, poolConsentAt: '2026-01-10' }),
        ).toBeNull();
        // Согласие дано позже месяца модели (догон прошлого месяца).
        expect(
            facts({ poolOptIn: true, poolConsentAt: '2026-10-01' }),
        ).toBeNull();
        // Шина тоже не обходит отзыв согласия.
        expect(
            portalPhase4FactsOf(
                { pool: poolSnapshot() },
                '2026-09',
                stored,
                [],
                { poolOptIn: false, poolConsentAt: null },
            ).pool,
        ).toBeNull();
    });

    it('календарь готовности: источник прогона важнее праздников', () => {
        const settings = portalSettings();
        expect(
            portalReadinessFactsOf(
                settings,
                { calendarSource: 'import' },
                [],
                '',
            ).calendarImported,
        ).toBe(true);
        expect(
            portalReadinessFactsOf(settings, {}, [], '').calendarImported,
        ).toBe(false);
        expect(
            portalReadinessFactsOf(
                settings,
                { calendarSource: 'fallback' },
                [],
                '',
            ),
        ).toMatchObject({
            calendarImported: false,
            calendarSource: 'fallback',
        });
    });

    it('шина: ключа нет — поле не задаётся, чужая форма — null', () => {
        expect(phase4BusFactsOf(undefined, undefined)).toEqual({});
        expect(phase4BusFactsOf({ x: 1 }, poolSnapshot())).toEqual({
            qualityLink: null,
            pool: poolSnapshot(),
        });
    });

    it('шаг модели передаёт связь, пул и источник календаря', () => {
        const bus = createStepBus();
        bus.set(AI_PIPELINE_BUS_KEYS.qualityLink, qualityLinkSnapshot());
        bus.set(AI_PIPELINE_BUS_KEYS.pool, {
            id: 'p',
            payload: poolSnapshot(),
        });
        const facts = portalModelFacts(
            {
                registry: {},
                paramsVersion: 'pv',
                comparableFrom: '',
                calcVersion: 'sam-1.0.0',
                inputsHash: 'h',
                calendarSource: 'override',
            } as never,
            bus,
        );
        expect(facts.qualityLink?.status).toBe('published');
        expect(facts.pool?.eligible).toBe(3);
        expect(facts.calendarSource).toBe('override');
    });
});
