import type {
    AnalyticsLiteMethodology,
    AnalyticsLitePoint,
} from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { DatedLiteRow } from '@lib/sales-ai-analytics';
import type { PBXService } from '@/modules/pbx';
import type { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import type { CallsLoader } from '../../domain/loaders/calls.loader';
import type { SettingsLoader } from '../../domain/loaders/settings.loader';
import type {
    AiAnalyticsFeedbackRecord,
    AiAnalyticsFeedbackStore,
} from '../../store/ai-analytics-feedback.store';
import {
    buildCallListKey,
    buildCallListStampKey,
    CallListIndexLoader,
} from '../calls-list-index.loader';
import {
    buildCallListRows,
    groupCallReviews,
} from '../calls-list-index.mapper';

const liteOf = (
    transcriptionId: string,
    fields: Partial<DatedLiteRow> = {},
): DatedLiteRow => ({
    transcriptionId,
    managerId: '447',
    callStartedAt: new Date('2026-11-10T08:00:00.000Z'),
    durationSec: 95.6,
    callType: 'cold',
    analysisPresent: true,
    score: 64,
    nextStep: null,
    riskFlags: [],
    coachingPriority: null,
    sections: [],
    objections: [],
    versions: null,
    ...fields,
});

const methodologyOf = (
    points: AnalyticsLitePoint[],
): AnalyticsLiteMethodology => ({
    code: 'polyansky',
    checkpointsDone: null,
    checkpointsTotal: null,
    spiralsFull: null,
    spiralsMinFull: null,
    dealProgress: null,
    capsApplied: 0,
    points,
});

const payloadOf = (fields: Record<string, unknown> = {}) => ({
    agree: true,
    leaderScore: 7,
    aiScore: 6.4,
    analysisId: '900',
    items: [],
    comment: '',
    authorRole: 'leader',
    authorName: 'Петров Пётр',
    ...fields,
});

const feedbackOf = (
    id: string,
    fields: Partial<AiAnalyticsFeedbackRecord> = {},
): AiAnalyticsFeedbackRecord => ({
    id,
    createdAt: new Date('2026-11-11T08:00:00.000Z'),
    status: 'done',
    kind: 'call_review',
    object: 'call:1',
    managerId: '447',
    transcriptionId: '1',
    requesterUserId: '10',
    reason: null,
    payload: payloadOf(),
    ...fields,
});

describe('выборка периода: строки и отзывы', () => {
    it('только звонки с разбором, оценка — по шкале витрины, новые сверху', () => {
        const { rows } = buildCallListRows([
            liteOf('1'),
            liteOf('2', { analysisPresent: false }),
            liteOf('3', {
                callStartedAt: new Date('2026-11-12T08:00:00.000Z'),
                score: null,
                durationSec: null,
                managerId: '0447',
            }),
        ]);
        expect(rows).toEqual([
            {
                transcriptionId: '3',
                managerId: '447',
                startedAt: '2026-11-12T08:00:00.000Z',
                durationSec: null,
                callType: 'cold',
                aiScore: null,
                badges: [],
                points: '',
            },
            {
                transcriptionId: '1',
                managerId: '447',
                startedAt: '2026-11-10T08:00:00.000Z',
                durationSec: 96,
                callType: 'cold',
                aiScore: 6.4,
                badges: [],
                points: '',
            },
        ]);
    });

    it('строки несут бейджи и статусы пунктов; коды пунктов — по алфавиту, только у звонков с разбором', () => {
        const { rows, pointCodes } = buildCallListRows([
            liteOf('1', {
                nextStep: { set: false, date: null },
                methodology: methodologyOf([
                    { code: 'pres.b', status: 'done' },
                    { code: 'cold.a', status: 'missed' },
                ]),
            }),
            liteOf('2', {
                methodology: methodologyOf([
                    { code: 'pres.b', status: 'not_applicable' },
                ]),
            }),
            liteOf('3', {
                analysisPresent: false,
                methodology: methodologyOf([
                    { code: 'zzz.never', status: 'done' },
                ]),
            }),
            liteOf('4'),
        ]);
        expect(pointCodes).toEqual(['cold.a', 'pres.b']);
        const byId = Object.fromEntries(
            rows.map(row => [row.transcriptionId, row]),
        );
        expect(Object.keys(byId).sort()).toEqual(['1', '2', '4']);
        expect(byId['1']).toMatchObject({
            badges: ['step_missing'],
            points: 'md',
        });
        expect(byId['2']).toMatchObject({ badges: [], points: '-n' });
        // Звонок без методики — «не проверялся» по каждому коду.
        expect(byId['4']).toMatchObject({ badges: [], points: '--' });
    });

    it('в периоде нет пунктов методики — кодов нет, записи пустые', () => {
        const { rows, pointCodes } = buildCallListRows([liteOf('1')]);
        expect(pointCodes).toEqual([]);
        expect(rows[0].points).toBe('');
    });

    it('отзывы: только call_review, по одному свежему на автора и звонок', () => {
        const grouped = groupCallReviews([
            feedbackOf('5', { payload: payloadOf({ agree: false }) }),
            feedbackOf('7', { payload: payloadOf({ leaderScore: 9 }) }),
            feedbackOf('6', { requesterUserId: '11' }),
            feedbackOf('8', { kind: 'disagree' }),
            feedbackOf('9', { payload: { agree: true } }),
            feedbackOf('10', { transcriptionId: null }),
            feedbackOf('11', { transcriptionId: '2' }),
        ]);
        expect(Object.keys(grouped).sort()).toEqual(['1', '2']);
        expect(grouped['1']).toEqual([
            {
                authorId: '10',
                agree: true,
                leaderScore: 9,
                createdAt: '2026-11-11T08:00:00.000Z',
            },
            {
                authorId: '11',
                agree: true,
                leaderScore: 7,
                createdAt: '2026-11-11T08:00:00.000Z',
            },
        ]);
    });
});

const DOMAIN = 'gsr.bitrix24.ru';
const FROM = '2026-11-01';
const TO = '2026-11-19';
const INDEX_KEY = buildCallListKey(DOMAIN, FROM, TO);
const STAMP_KEY = buildCallListStampKey(INDEX_KEY);

/** Значение через JSON — как проходит через Redis: объект на выходе не тот, что на входе. */
const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Кэш-двойник на одном хранилище: ключи как в Redis, `remember` — как у
 * настоящего. Выборку читает только `remember` (считаем чтения большого
 * ключа), а метку — `getJson`.
 */
function fakeCache(store: Map<string, unknown> = new Map()) {
    const getJson = jest.fn((key: string) =>
        Promise.resolve(store.has(key) ? throughJson(store.get(key)) : null),
    );
    const setVolatileJson = jest.fn((key: string, value: unknown) => {
        store.set(key, throughJson(value));
        return Promise.resolve();
    });
    const remember = jest.fn(
        async (
            key: string,
            _ttl: number,
            compute: () => Promise<unknown>,
        ): Promise<{ value: unknown; fromCache: boolean }> => {
            if (store.has(key)) {
                return { value: throughJson(store.get(key)), fromCache: true };
            }
            const value = await compute();
            store.set(key, throughJson(value));
            return { value, fromCache: false };
        },
    );
    return { store, getJson, setVolatileJson, remember };
}

describe('CallListIndexLoader', () => {
    function harness(cache = fakeCache()) {
        const settings = {
            load: jest.fn(() =>
                Promise.resolve({ calendar: { timeZone: 'Europe/Moscow' } }),
            ),
        };
        const calls = {
            loadLite: jest.fn(() =>
                Promise.resolve([
                    liteOf('1', {
                        methodology: methodologyOf([
                            { code: 'pres.a', status: 'missed' },
                        ]),
                    }),
                ]),
            ),
        };
        const feedback = {
            listInPeriod: jest.fn(() => Promise.resolve([feedbackOf('5')])),
        };
        const pbx = {
            init: jest.fn(() =>
                Promise.resolve({
                    bitrix: {
                        user: {
                            get: jest.fn(() =>
                                Promise.resolve({
                                    result: [
                                        {
                                            ID: '447',
                                            NAME: 'Мария',
                                            LAST_NAME: 'Иванова',
                                        },
                                    ],
                                }),
                            ),
                        },
                    },
                }),
            ),
        };
        const loader = new CallListIndexLoader(
            settings as unknown as SettingsLoader,
            calls as unknown as CallsLoader,
            feedback as unknown as AiAnalyticsFeedbackStore,
            pbx as unknown as PBXService,
            cache as unknown as AiAnalyticsCacheService,
        );
        return { loader, calls, feedback, cache, pbx };
    }

    it('ключ кэша — портал и период, версия v2, срок — 5 минут, только Redis', async () => {
        const { loader, cache } = harness();
        await loader.load(DOMAIN, FROM, TO);
        expect(cache.remember).toHaveBeenCalledWith(
            'sales-ai-analytics:v1:gsr.bitrix24.ru:call-list:v2:2026-11-01_2026-11-19',
            300,
            expect.any(Function),
            { volatile: true },
        );
        expect(buildCallListKey('d', 'a', 'b')).toBe(
            'sales-ai-analytics:v1:d:call-list:v2:a_b',
        );
    });

    it('метка лежит рядом с выборкой в той же секции кэша', () => {
        expect(STAMP_KEY).toBe(`${INDEX_KEY}:stamp`);
        expect(
            STAMP_KEY.startsWith(
                'sales-ai-analytics:v1:gsr.bitrix24.ru:call-list:',
            ),
        ).toBe(true);
    });

    it('звонки — за дни портала, отзывы — от начала периода до «сейчас»', async () => {
        const { loader, calls, feedback } = harness();
        const now = new Date('2026-12-05T10:00:00.000Z');

        const index = await loader.load(DOMAIN, FROM, TO, now);

        expect(calls.loadLite).toHaveBeenCalledWith(
            DOMAIN,
            new Date('2026-10-31T21:00:00.000Z'),
            expect.any(Date),
        );
        expect(feedback.listInPeriod).toHaveBeenCalledWith(
            DOMAIN,
            new Date('2026-10-31T21:00:00.000Z'),
            now,
        );
        expect(index.rows.map(row => row.transcriptionId)).toEqual(['1']);
        expect(index.reviews['1']).toHaveLength(1);
        expect(index.managerNames).toEqual({ '447': 'Иванова Мария' });
    });

    it('выборка несёт коды пунктов и статусы пунктов звонков', async () => {
        const { loader } = harness();
        const index = await loader.load(DOMAIN, FROM, TO);
        expect(index.pointCodes).toEqual(['pres.a']);
        expect(index.rows[0]).toMatchObject({ badges: [], points: 'm' });
    });

    it('имена не прочитались — выборка без имён, не ошибка', async () => {
        const { loader, pbx } = harness();
        pbx.init.mockRejectedValueOnce(new Error('портал недоступен'));
        const index = await loader.load('d', FROM, '2026-11-02');
        expect(index.managerNames).toEqual({});
        expect(index.rows).toHaveLength(1);
    });

    describe('память процесса и метка', () => {
        it('сборка выборки пишет метку — случайный id на тот же срок, только в Redis', async () => {
            const { loader, cache } = harness();
            await loader.load(DOMAIN, FROM, TO);
            expect(cache.setVolatileJson).toHaveBeenCalledTimes(1);
            expect(cache.setVolatileJson).toHaveBeenCalledWith(
                STAMP_KEY,
                expect.stringMatching(/^[0-9a-f-]{36}$/),
                300,
            );
        });

        it('запросы с одной меткой читают большой ключ один раз', async () => {
            const { loader, cache, calls } = harness();

            const first = await loader.load(DOMAIN, FROM, TO);
            const second = await loader.load(DOMAIN, FROM, TO);
            const third = await loader.load(DOMAIN, FROM, TO);

            expect(cache.remember).toHaveBeenCalledTimes(1);
            expect(calls.loadLite).toHaveBeenCalledTimes(1);
            expect(second).toBe(first);
            expect(third).toBe(first);
            // Каждый запрос читает только метку, но не выборку.
            expect(cache.getJson.mock.calls.map(([key]) => key)).toEqual([
                STAMP_KEY,
                STAMP_KEY,
                STAMP_KEY,
            ]);
        });

        it('метку убрали вместе с выборкой (сброс секции) — выборка собирается заново, метка новая', async () => {
            const { loader, cache, calls } = harness();
            await loader.load(DOMAIN, FROM, TO);
            const firstStamp = cache.store.get(STAMP_KEY);

            // Сброс секции уносит и выборку, и метку.
            cache.store.delete(STAMP_KEY);
            cache.store.delete(INDEX_KEY);
            const rebuilt = await loader.load(DOMAIN, FROM, TO);

            expect(cache.remember).toHaveBeenCalledTimes(2);
            expect(calls.loadLite).toHaveBeenCalledTimes(2);
            expect(rebuilt.rows).toHaveLength(1);
            const nextStamp = cache.store.get(STAMP_KEY);
            expect(nextStamp).toEqual(expect.any(String));
            expect(nextStamp).not.toBe(firstStamp);
        });

        it('метку убрали, выборка в Redis осталась — память не берётся, Redis читается заново, метка создаётся', async () => {
            const { loader, cache, calls } = harness();
            const first = await loader.load(DOMAIN, FROM, TO);
            cache.store.delete(STAMP_KEY);

            const second = await loader.load(DOMAIN, FROM, TO);

            expect(cache.remember).toHaveBeenCalledTimes(2);
            // Из Redis (другой объект), а не из памяти и не пересобрана.
            expect(calls.loadLite).toHaveBeenCalledTimes(1);
            expect(second).not.toBe(first);
            expect(second).toEqual(first);
            expect(cache.store.get(STAMP_KEY)).toEqual(expect.any(String));
        });

        it('выборка есть в Redis, метки нет — метка создаётся (процесс с пустой памятью)', async () => {
            const stored = new Map<string, unknown>();
            const seeded = await harness(fakeCache(stored)).loader.load(
                DOMAIN,
                FROM,
                TO,
            );
            stored.delete(STAMP_KEY);

            const cache = fakeCache(stored);
            const { loader, calls } = harness(cache);
            const loaded = await loader.load(DOMAIN, FROM, TO);

            expect(loaded).toEqual(seeded);
            expect(calls.loadLite).not.toHaveBeenCalled();
            expect(cache.setVolatileJson).toHaveBeenCalledTimes(1);
            expect(cache.setVolatileJson).toHaveBeenCalledWith(
                STAMP_KEY,
                expect.any(String),
                300,
            );
        });

        it('другой процесс пересобрал выборку (метка сменилась) — память сбрасывается, дальше снова из памяти', async () => {
            const { loader, cache } = harness();
            await loader.load(DOMAIN, FROM, TO);

            cache.store.set(STAMP_KEY, 'метка-другого-процесса');
            await loader.load(DOMAIN, FROM, TO);
            expect(cache.remember).toHaveBeenCalledTimes(2);

            // Новая метка живая — своей не пишем; следующий запрос — из памяти.
            expect(cache.setVolatileJson).toHaveBeenCalledTimes(1);
            await loader.load(DOMAIN, FROM, TO);
            expect(cache.remember).toHaveBeenCalledTimes(2);
        });

        it('периоды не мешают друг другу: у каждого своя запись памяти', async () => {
            const { loader, cache } = harness();
            await loader.load(DOMAIN, FROM, TO);
            await loader.load(DOMAIN, FROM, '2026-11-10');
            await loader.load(DOMAIN, FROM, TO);
            await loader.load(DOMAIN, FROM, '2026-11-10');
            expect(cache.remember).toHaveBeenCalledTimes(2);
        });

        it('метка не прочиталась — выборка читается как раньше, ответ не страдает', async () => {
            const { loader, cache } = harness();
            cache.getJson.mockRejectedValueOnce(new Error('Redis недоступен'));
            const index = await loader.load(DOMAIN, FROM, TO);
            expect(index.rows).toHaveLength(1);
            expect(cache.remember).toHaveBeenCalledTimes(1);
        });

        it('метка не записалась — ответ не страдает, а следующий запрос не берёт память', async () => {
            const { loader, cache } = harness();
            cache.setVolatileJson.mockRejectedValueOnce(
                new Error('Redis недоступен'),
            );
            const first = await loader.load(DOMAIN, FROM, TO);
            expect(first.rows).toHaveLength(1);

            // Метки в Redis нет — память без неё не действует.
            await loader.load(DOMAIN, FROM, TO);
            expect(cache.remember).toHaveBeenCalledTimes(2);
        });
    });
});
