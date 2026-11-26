import { LONG_CALL_CACHE_TTL_SEC } from '../long-call-service.const';
import {
    DOMAIN,
    LONG_TRANSCRIPT,
    MODE_ON,
    defaultAnswer,
    defaultParts,
    fakeRedis,
    isPartCall,
    isSummaryCall,
    makeLongCallService,
    partNumberOf,
    rawEmptyDigest,
    spyOnServiceLog,
    type ModelHandler,
} from './long-call-input.service.fixture';

/**
 * LongCallInputService.prepare — кэш ответов модели в Redis (подставном).
 * Повторный разбор того же звонка не платит за конспекты и сводку заново.
 */

const parts = defaultParts(LONG_TRANSCRIPT);
const REQUESTS = parts.length + 1;

describe('LongCallInputService.prepare — кэш', () => {
    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('второй prepare с тем же текстом не делает запросов и возвращает пустой расход', async () => {
        const redis = fakeRedis();
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            redis,
        });

        const first = await service.prepare(DOMAIN, LONG_TRANSCRIPT);
        expect(calls).toHaveLength(REQUESTS);
        expect(first?.completions).toHaveLength(REQUESTS);

        const second = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(calls).toHaveLength(REQUESTS);
        expect(second?.completions).toEqual([]);
        // Тексты те же: из кэша вернулись те же ответы.
        expect(second?.texts).toEqual(first?.texts);
        expect(second?.report).toEqual(first?.report);
    });

    it('в журнале видно, сколько ответов взято из кэша', async () => {
        const log = spyOnServiceLog();
        const { service } = makeLongCallService({
            settings: MODE_ON,
            redis: fakeRedis(),
        });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);
        await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        const lines = log.log.mock.calls.map(call => String(call[0]));
        expect(lines[0]).toContain(`запросов ${REQUESTS}, из кэша 0`);
        expect(lines[1]).toContain(`запросов 0, из кэша ${REQUESTS}`);
    });

    it('записи — на сутки, по одной на часть и на сводку', async () => {
        const redis = fakeRedis();
        const { service } = makeLongCallService({ settings: MODE_ON, redis });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(redis.store.size).toBe(REQUESTS);
        for (const [key, entry] of redis.store) {
            expect(entry.ttlSec).toBe(LONG_CALL_CACHE_TTL_SEC);
            expect(key).toMatch(
                /^event-sales:long-call:v1:call_long_(part|summary):[0-9a-f]{40}$/,
            );
        }
        expect(LONG_CALL_CACHE_TTL_SEC).toBe(24 * 60 * 60);
    });

    it('домен в ключ не входит: другой портал с тем же текстом берёт ответы из кэша', async () => {
        const redis = fakeRedis();
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            redis,
        });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);
        await service.prepare('other.bitrix24.ru', LONG_TRANSCRIPT);

        expect(calls).toHaveLength(REQUESTS);
    });

    it('модель в ключ входит: другая модель — запросы заново', async () => {
        const redis = fakeRedis();
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            redis,
        });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT, { model: 'bitrix/a' });
        await service.prepare(DOMAIN, LONG_TRANSCRIPT, { model: 'bitrix/a' });
        expect(calls).toHaveLength(REQUESTS);

        await service.prepare(DOMAIN, LONG_TRANSCRIPT, { model: 'bitrix/b' });
        expect(calls).toHaveLength(REQUESTS * 2);
        expect(redis.store.size).toBe(REQUESTS * 2);
    });

    it('размер части меняет текст задания — ключ другой, старые ответы не подмешиваются', async () => {
        const redis = fakeRedis();
        const first = makeLongCallService({ settings: MODE_ON, redis });
        await first.service.prepare(DOMAIN, LONG_TRANSCRIPT);

        const second = makeLongCallService({
            settings: { ...MODE_ON, CALL_LONG_PART_CHARS: '5000' },
            redis,
        });
        const result = await second.service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(result?.partChars).toBe(5_000);
        // Ни одного попадания в кэш: все части и сводка — настоящие запросы.
        expect(second.calls).toHaveLength(result!.report.partsCount + 1);
        expect(second.calls.filter(isPartCall)).toHaveLength(
            result!.report.partsCount,
        );
    });

    it('пустые и неразобранные ответы не кэшируются', async () => {
        const redis = fakeRedis();
        const handler: ModelHandler = (call, index) => {
            if (isPartCall(call) && partNumberOf(call) === 1) {
                // Часть 1: пустой конспект на обеих попытках.
                return rawEmptyDigest();
            }
            if (isPartCall(call) && partNumberOf(call) === 2) {
                // Часть 2: ответ не разбирается на обеих попытках.
                return 'не JSON';
            }

            return defaultAnswer(call, index);
        };
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            redis,
            handler,
        });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);
        // 1 (пустой + повтор) и 2 (неразобранный + повтор) — по два запроса.
        const firstRound = calls.length;
        expect(firstRound).toBe(REQUESTS + 2);
        // В кэше — только удавшиеся: части 3… и сводка.
        expect(redis.store.size).toBe(parts.length - 2 + 1);

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        // Из кэша — всё, что кэшировалось; части 1 и 2 запрошены заново, по два раза.
        expect(calls.length - firstRound).toBe(4);
        const secondRound = calls.slice(firstRound);
        expect(secondRound.filter(isSummaryCall)).toHaveLength(0);
        expect(
            secondRound.every(call => [1, 2].includes(partNumberOf(call))),
        ).toBe(true);
    });

    it('сбой Redis не роняет подготовку: запросы идут к модели, результат есть', async () => {
        const redis = fakeRedis(true);
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            redis,
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(result).not.toBeNull();
        expect(calls).toHaveLength(REQUESTS);
        expect(result?.completions).toHaveLength(REQUESTS);
        expect(redis.client.get).toHaveBeenCalled();
        expect(redis.store.size).toBe(0);
    });

    it('запись в кэше не по форме (не объект) — считается отсутствующей', async () => {
        const redis = fakeRedis();
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            redis,
        });
        await service.prepare(DOMAIN, LONG_TRANSCRIPT);
        for (const [key, entry] of redis.store) {
            redis.store.set(key, { ...entry, value: '"просто строка"' });
        }

        const again = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(again).not.toBeNull();
        expect(calls).toHaveLength(REQUESTS * 2);
    });

    it('без Redis сервис работает, кэша нет', async () => {
        const { service, calls } = makeLongCallService({ settings: MODE_ON });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);
        await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(calls).toHaveLength(REQUESTS * 2);
    });
});
