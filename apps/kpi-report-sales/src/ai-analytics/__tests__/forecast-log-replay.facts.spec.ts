import 'reflect-metadata';
import type { ForecastLogSnapshot } from '@lib/sales-ai-analytics';
import { defaultTargets } from '@lib/sales-ai-analytics/settings/ai-settings.defaults';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import {
    entryRateOf,
    episodesOpenAt,
    isMonthClosed,
    managerMonthsOf,
    pipelineByManager,
    replayDaysOf,
    replayEpisodesOf,
    replayManagerInput,
    replayModelOf,
    salesBefore,
    type ReplayEpisode,
} from '../steps/forecast-log-replay.facts';
import {
    mergeReplayedLog,
    replayInstantOf,
} from '../steps/forecast-log-replay.days';
import {
    FIXTURE_META,
    forecastLog,
    logDay,
    managerMonth,
} from './fixtures/forecast-log.fixture';
import { portalModel } from './fixtures/norms.fixture';

/**
 * Чистые факты воспроизведения журнала прогноза (шаг
 * `forecast-log-replay`): какие дни восстанавливать, чтобы не затереть
 * живые; открытые эпизоды и продажи «в ночь на день d»; темп, известный
 * к дню; слияние с живыми днями.
 */
const WORKDAYS = [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-07',
];

const episode = (overrides: Partial<ReplayEpisode> = {}): ReplayEpisode => ({
    key: 'D1#0',
    stageCode: 'sales_pres',
    startedAt: '2026-08-20T10:00:00.000Z',
    endedAt: null,
    ...overrides,
});

const modelWithTheta = (): Pick<PortalModelPayload, 'stageTheta'> => ({
    stageTheta: [
        {
            stageCode: 'sales_pres',
            order: 3,
            n: 40,
            s: 12,
            value: 0.3,
            w: 0.8,
            ci90: [0.2, 0.4],
        },
    ],
});

describe('forecast-log-replay.facts — закрытый месяц и дни восстановления', () => {
    it('месяц закрыт, когда его ключ раньше текущего месяца портала (TZ портала)', () => {
        // В Москве уже 1 октября 01:30, по UTC ещё 30 сентября.
        const now = new Date('2026-09-30T22:30:00Z');
        expect(isMonthClosed('2026-09', now, 'Europe/Moscow')).toBe(true);
        expect(isMonthClosed('2026-09', now, 'UTC')).toBe(false);
        expect(isMonthClosed('2026-10', now, 'Europe/Moscow')).toBe(false);
        expect(isMonthClosed('2026-08', now, 'UTC')).toBe(true);
    });

    it('журнала нет или все дни восстановлены — восстанавливаются все рабочие дни', () => {
        expect(replayDaysOf(null, WORKDAYS)).toEqual(WORKDAYS);
        const replayed = forecastLog('2026-09', [
            logDay('2026-09-01', 5, { replayed: true }),
            logDay('2026-09-03', 6, { replayed: true }),
        ]);
        expect(replayDaysOf(replayed, WORKDAYS)).toEqual(WORKDAYS);
    });

    it('есть живые дни — только дни раньше первого живого', () => {
        const mixed = forecastLog('2026-09', [
            logDay('2026-09-01', 5, { replayed: true }),
            logDay('2026-09-07', 9),
            logDay('2026-09-03', 6),
        ]);
        expect(replayDaysOf(mixed, WORKDAYS)).toEqual([
            '2026-09-01',
            '2026-09-02',
        ]);
        const fromStart = forecastLog('2026-09', [logDay('2026-09-01', 5)]);
        expect(replayDaysOf(fromStart, WORKDAYS)).toEqual([]);
    });

    it('модель пригодна только с рёбрами в нагрузке', () => {
        expect(replayModelOf(null)).toBeNull();
        expect(
            replayModelOf({ id: 'm', monthKey: '2026-08', payload: {} }),
        ).toBeNull();
        const payload = portalModel() as unknown as PortalModelPayload;
        expect(
            replayModelOf({ id: 'm', monthKey: '2026-08', payload }),
        ).toEqual({ id: 'm', payload });
    });
});

describe('forecast-log-replay.facts — эпизоды и продажи на момент', () => {
    it('момент «ночь на день» — начало суток портала', () => {
        expect(replayInstantOf('2026-09-08', 'Europe/Moscow')).toBe(
            '2026-09-07T21:00:00.000Z',
        );
        expect(replayInstantOf('2026-09-08', 'UTC')).toBe(
            '2026-09-08T00:00:00.000Z',
        );
    });

    it('эпизоды шины читаются структурно, чужая форма отбрасывается', () => {
        expect(
            replayEpisodesOf([
                episode(),
                { key: 'bad', stageCode: 'x', startedAt: 5, endedAt: null },
                { key: 'bad2', stageCode: 'x', startedAt: 'a', endedAt: 7 },
                'мусор',
            ]),
        ).toEqual([episode()]);
        expect(replayEpisodesOf(undefined)).toEqual([]);
    });

    it('открыт на момент: начался раньше, закончился позже или не закончился; возраст — до момента', () => {
        const at = '2026-09-07T21:00:00.000Z';
        const open = episodesOpenAt(
            [
                episode(),
                episode({ key: 'late', startedAt: '2026-09-10T10:00:00Z' }),
                episode({
                    key: 'closed-before',
                    endedAt: '2026-09-05T10:00:00Z',
                }),
                episode({
                    key: 'closed-after',
                    endedAt: '2026-09-20T10:00:00Z',
                }),
                episode({ key: 'broken', startedAt: 'не дата' }),
            ],
            at,
        );
        expect(open.map(item => item.key)).toEqual(['D1#0', 'closed-after']);
        expect(open[0].ageDays).toBeCloseTo(18.46, 2);
        expect(open[0].stageCode).toBe('sales_pres');
    });

    it('пайплайн по менеджерам: сцепка через ключ эпизода и θ стадии модели', () => {
        const pipeline = pipelineByManager(
            [
                { key: 'D1#0', stageCode: 'sales_pres', ageDays: 10 },
                { key: 'D2#0', stageCode: 'unknown', ageDays: 3 },
                { key: 'D3#0', stageCode: 'sales_pres', ageDays: 1 },
            ],
            new Map([
                ['D1#0', '10'],
                ['D2#0', '10'],
            ]),
            modelWithTheta(),
        );
        expect(pipeline.get('10')).toEqual([
            { id: 'D1#0', ageDays: 10, theta: 0.3 },
            { id: 'D2#0', ageDays: 3, theta: 0 },
        ]);
        // Эпизод без сцепки с менеджером в пайплайн не попадает.
        expect(pipeline.has('20')).toBe(false);
    });

    it('продажи к дню — закрытые строго раньше дня', () => {
        const deals = [
            { managerId: '10', closeDay: '2026-09-03' },
            { managerId: '10', closeDay: '2026-09-04' },
            { managerId: '20', closeDay: '2026-09-01' },
        ];
        expect([...salesBefore(deals, '2026-09-04')]).toEqual([
            ['10', 1],
            ['20', 1],
        ]);
        expect(salesBefore(deals, '2026-09-01').size).toBe(0);
        expect(salesBefore(deals, '2026-09-30').get('10')).toBe(2);
    });
});

describe('forecast-log-replay.facts — темп и вход менеджера', () => {
    const months = managerMonthsOf(
        [
            managerMonth('10', '2026-09', 5),
            { ...managerMonth('10', '2026-08', 4), callsDone: 210 },
            managerMonth('20', '2026-09', 3),
            managerMonth('99', '2026-07', 1),
        ],
        '2026-09',
        '2026-08',
    );

    it('месяцы по менеджерам: сам месяц и прошлый, остальные не нужны', () => {
        expect(months.get('10')?.current?.salesCount).toBe(5);
        expect(months.get('10')?.previous?.callsDone).toBe(210);
        expect(months.get('20')?.previous).toBeUndefined();
        expect(months.has('99')).toBe(false);
    });

    it('темп: прошлый месяц на его рабочие дни; без прошлого — средний темп месяца; иначе ноль', () => {
        const options = { previousWorkdays: 21, workdays: 22 };
        expect(
            entryRateOf({ months: months.get('10') ?? {}, ...options }),
        ).toBe(10);
        expect(
            entryRateOf({ months: months.get('20') ?? {}, ...options }),
        ).toBeCloseTo(200 / 22, 9);
        expect(entryRateOf({ months: {}, ...options })).toBe(0);
        expect(
            entryRateOf({
                months: months.get('10') ?? {},
                previousWorkdays: 0,
                workdays: 0,
            }),
        ).toBe(0);
    });

    it('вход менеджера: сделано к дню, темп × прошедшие дни, факт прошлого месяца, нормы модели, без рёбер', () => {
        const model = portalModel({
            managerNorms: [{ managerId: '10', tenureBand: '6-18', edges: [] }],
        }) as unknown as PortalModelPayload;
        const input = replayManagerInput({
            managerId: '10',
            months: months.get('10') ?? {},
            doneSales: 2,
            entryRate: 10,
            daysElapsed: 4,
            openEpisodes: [{ id: 'D1#0', ageDays: 3, theta: 0.3 }],
            model,
            targets: { ...defaultTargets(), overrides: { '10': 7 } },
        });
        expect(input).toMatchObject({
            managerId: '10',
            doneSales: 2,
            entryDone: 40,
            planHead: 5,
            override: 7,
            levelTarget: null,
            lastMonthSales: 4,
            edges: [],
            quality: null,
        });
        expect(input.norms?.managerId).toBe('10');
        expect(input.openEpisodes).toHaveLength(1);
        expect(
            replayManagerInput({
                managerId: '20',
                months: {},
                doneSales: 0,
                entryRate: 0,
                daysElapsed: 0,
                openEpisodes: [],
                model,
                targets: defaultTargets(),
            }),
        ).toMatchObject({ lastMonthSales: null, norms: null, planHead: null });
    });
});

describe('forecast-log-replay.days — слияние с живыми днями', () => {
    const previous: ForecastLogSnapshot = forecastLog(
        '2026-09',
        [
            logDay('2026-09-01', 5, { replayed: true }),
            logDay('2026-09-07', 9),
            logDay('2026-09-03', 6),
        ],
        42,
    );

    it('живые дни остаются и побеждают при совпадении, прежние восстановленные заменяются, дни по возрастанию', () => {
        const merged = mergeReplayedLog({
            monthKey: '2026-09',
            previous,
            days: [
                logDay('2026-09-02', 7, { replayed: true }),
                logDay('2026-09-03', 99, { replayed: true }),
            ],
            actual: null,
            checkSource: 'default',
            meta: { ...FIXTURE_META },
        });
        expect(
            merged.days.map(day => [day.day, day.p50, day.replayed]),
        ).toEqual([
            ['2026-09-02', 7, true],
            ['2026-09-03', 6, undefined],
            ['2026-09-07', 9, undefined],
        ]);
        expect(merged.actual).toBe(42);
        expect(merged.meta).toEqual({ ...FIXTURE_META, source: 'replay' });
    });

    it('переданный факт побеждает прежний; без журнала — только новые дни', () => {
        const merged = mergeReplayedLog({
            monthKey: '2026-09',
            previous: null,
            days: [logDay('2026-09-01', 5, { replayed: true })],
            actual: 8,
            checkSource: 'estimated',
            meta: { ...FIXTURE_META },
        });
        expect(merged.days).toHaveLength(1);
        expect(merged.actual).toBe(8);
        expect(merged.checkSource).toBe('estimated');
    });
});
