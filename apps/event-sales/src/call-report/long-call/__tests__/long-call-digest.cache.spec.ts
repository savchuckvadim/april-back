import { createHash } from 'node:crypto';
import {
    LongCallDigestCache,
    longCallCacheKey,
    type LongCallCacheRequest,
} from '../long-call-digest.cache';
import { LONG_CALL_CACHE_TTL_SEC } from '../long-call-service.const';
import { fakeRedis } from './long-call-input.service.fixture';

/**
 * Кэш ответов модели по длинному разговору: ключ, срок жизни, поведение при
 * сбое Redis. Redis подставной.
 */
const request = (
    overrides: Partial<LongCallCacheRequest> = {},
): LongCallCacheRequest => ({
    role: 'call_long_part',
    model: 'bitrix/gpt',
    system: 'задание',
    user: 'ЧАСТЬ 1 ИЗ 3:\nтекст',
    ...overrides,
});

describe('longCallCacheKey', () => {
    it('sha1 в шестнадцатеричном виде под префиксом роли', () => {
        const key = longCallCacheKey(request());

        expect(key).toMatch(
            /^event-sales:long-call:v1:call_long_part:[0-9a-f]{40}$/,
        );
        const expected = createHash('sha1')
            .update(
                [
                    'call_long_part',
                    'bitrix/gpt',
                    'задание',
                    'ЧАСТЬ 1 ИЗ 3:\nтекст',
                ].join('\u0000'),
            )
            .digest('hex');
        expect(key.endsWith(expected)).toBe(true);
    });

    it('один и тот же запрос — один и тот же ключ', () => {
        expect(longCallCacheKey(request())).toBe(longCallCacheKey(request()));
    });

    it('роль, модель, задание и текст меняют ключ', () => {
        const base = longCallCacheKey(request());

        expect(
            longCallCacheKey(request({ role: 'call_long_summary' })),
        ).not.toBe(base);
        expect(longCallCacheKey(request({ model: 'bitrix/other' }))).not.toBe(
            base,
        );
        expect(
            longCallCacheKey(request({ system: 'другое задание' })),
        ).not.toBe(base);
        expect(longCallCacheKey(request({ user: 'другой текст' }))).not.toBe(
            base,
        );
    });

    it('граница между полями однозначна: «ab»+«c» и «a»+«bc» — разные ключи', () => {
        expect(longCallCacheKey(request({ system: 'ab', user: 'c' }))).not.toBe(
            longCallCacheKey(request({ system: 'a', user: 'bc' })),
        );
    });

    it('модель не задана — отдельный ключ от любой заданной', () => {
        expect(longCallCacheKey(request({ model: undefined }))).not.toBe(
            longCallCacheKey(request({ model: 'bitrix/gpt' })),
        );
    });
});

describe('LongCallDigestCache', () => {
    it('кладёт ответ на сутки и отдаёт его по тому же запросу', async () => {
        const redis = fakeRedis();
        const cache = new LongCallDigestCache(redis.redis as never);

        await cache.set(request(), { summary: 'ответ' });

        expect(redis.store.size).toBe(1);
        const [entry] = redis.store.values();
        expect(entry.ttlSec).toBe(LONG_CALL_CACHE_TTL_SEC);
        expect(await cache.get(request())).toEqual({ summary: 'ответ' });
        expect(await cache.get(request({ user: 'другой' }))).toBeUndefined();
    });

    it('роли не пересекаются: ответ на часть не отдаётся как сводка', async () => {
        const cache = new LongCallDigestCache(fakeRedis().redis as never);

        await cache.set(request(), { summary: 'часть' });

        expect(
            await cache.get(request({ role: 'call_long_summary' })),
        ).toBeUndefined();
    });

    it('без Redis — всегда пусто, запись молчит', async () => {
        const cache = new LongCallDigestCache(undefined);

        await expect(cache.set(request(), { a: 1 })).resolves.toBeUndefined();
        expect(await cache.get(request())).toBeUndefined();
    });

    it('Redis падает — чтение пусто, запись молчит, исключений нет', async () => {
        const redis = fakeRedis(true);
        const cache = new LongCallDigestCache(redis.redis as never);

        await expect(cache.set(request(), { a: 1 })).resolves.toBeUndefined();
        expect(await cache.get(request())).toBeUndefined();
    });

    it('не объект в записи — как будто записи нет', async () => {
        const redis = fakeRedis();
        const cache = new LongCallDigestCache(redis.redis as never);
        redis.store.set(longCallCacheKey(request()), {
            value: '[1,2]',
            ttlSec: 1,
        });

        expect(await cache.get(request())).toBeUndefined();
    });
});
