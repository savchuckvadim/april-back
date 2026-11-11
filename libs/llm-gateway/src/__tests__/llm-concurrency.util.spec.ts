import {
    KeyedConcurrencyLimiter,
    apiKeyFingerprint,
} from '../llm-concurrency.util';

/**
 * Чистая часть ограничителя запросов к VibeCode (11.11.2026): отпечаток
 * ключа для Map семафоров и смена пределов на ходу. Очередь и слоты в
 * связке с адаптером — vibecode-structured.adapter.spec, разбор пределов из
 * настроек — llm-gateway-settings.spec.
 */
describe('apiKeyFingerprint — ключ Map семафоров без секрета', () => {
    it('16 hex-знаков; один ключ — один отпечаток, разные ключи — разные', () => {
        const fingerprint = apiKeyFingerprint('vibe-secret-key');

        expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
        expect(apiKeyFingerprint('vibe-secret-key')).toBe(fingerprint);
        expect(apiKeyFingerprint('vibe-other-key')).not.toBe(fingerprint);
    });
});

/** Дать отработать микрозадачам: захват слотов, вызов fn. */
const flush = () => new Promise<void>(done => setImmediate(done));

/** Вызов, который «думает», пока тест его не отпустит. */
function held(): { promise: Promise<string>; release: () => void } {
    let release: () => void = () => undefined;
    const promise = new Promise<string>(done => {
        release = () => done('ok');
    });
    return { promise, release };
}

describe('KeyedConcurrencyLimiter.setLimits — пределы из админки без перезапуска', () => {
    it('общий предел подняли — ждущий вызов другого ключа стартует сразу', async () => {
        const limiter = new KeyedConcurrencyLimiter({ perKey: 5, total: 1 });
        const first = held();
        const started: string[] = [];

        const a = limiter.run('key-a', () => {
            started.push('a');
            return first.promise;
        });
        const b = limiter.run('key-b', () => {
            started.push('b');
            return Promise.resolve('ok');
        });
        await flush();
        expect(started).toEqual(['a']);

        limiter.setLimits({ perKey: 5, total: 2 });
        await flush();
        expect(started).toEqual(['a', 'b']);

        first.release();
        await Promise.all([a, b]);
    });

    it('предел ключа меняется и у семафоров, созданных до правки', async () => {
        const limiter = new KeyedConcurrencyLimiter({ perKey: 1, total: 10 });
        const first = held();
        const started: string[] = [];

        const a1 = limiter.run('key-a', () => {
            started.push('a1');
            return first.promise;
        });
        const a2 = limiter.run('key-a', () => {
            started.push('a2');
            return Promise.resolve('ok');
        });
        await flush();
        expect(started).toEqual(['a1']);

        limiter.setLimits({ perKey: 2, total: 10 });
        await flush();
        expect(started).toEqual(['a1', 'a2']);

        first.release();
        await Promise.all([a1, a2]);
    });

    it('те же пределы — ничего не меняется, очередь не трогается', async () => {
        const limiter = new KeyedConcurrencyLimiter({ perKey: 1, total: 1 });
        const first = held();
        const started: string[] = [];

        const a = limiter.run('key-a', () => {
            started.push('a');
            return first.promise;
        });
        const b = limiter.run('key-b', () => {
            started.push('b');
            return Promise.resolve('ok');
        });
        await flush();
        limiter.setLimits({ perKey: 1, total: 1 });
        await flush();
        expect(started).toEqual(['a']);

        first.release();
        await Promise.all([a, b]);
        expect(started).toEqual(['a', 'b']);
    });
});
