import { LONG_CALL_PART_CONCURRENCY } from '../long-call-service.const';
import {
    DOMAIN,
    LONG_TRANSCRIPT,
    MODE_ON,
    defaultParts,
    isPartCall,
    isSummaryCall,
    makeLongCallService,
    spyOnServiceLog,
    transcriptOf,
} from './long-call-input.service.fixture';

/**
 * LongCallInputService.prepare — что уходит к модели: параллельность,
 * параметры вызова, порядок, расход и строка в журнале. Шлюз подставной.
 */
describe('LongCallInputService.prepare — запросы к модели', () => {
    const parts = defaultParts(LONG_TRANSCRIPT);

    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('не больше трёх конспектов одновременно, и три — действительно идут разом', async () => {
        const text = transcriptOf(60_000);
        expect(defaultParts(text).length).toBeGreaterThan(
            LONG_CALL_PART_CONCURRENCY,
        );
        const { service, maxActive } = makeLongCallService({
            settings: MODE_ON,
        });

        await service.prepare(DOMAIN, text);

        expect(maxActive()).toBe(LONG_CALL_PART_CONCURRENCY);
    });

    it('счётчик одновременных запросов свой на каждый prepare', async () => {
        const text = transcriptOf(60_000);
        const { service, maxActive } = makeLongCallService({
            settings: MODE_ON,
        });

        await Promise.all([
            service.prepare(DOMAIN, text),
            service.prepare(DOMAIN, `${text}\n[99:00] Клиент: ещё.`),
        ]);

        // Два разговора разом — у каждого свои три слота.
        expect(maxActive()).toBe(LONG_CALL_PART_CONCURRENCY * 2);
    });

    it('параметры вызова: имя схемы, домен, модель, тревога шлюза отложена', async () => {
        const { service, calls } = makeLongCallService({ settings: MODE_ON });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT, {
            model: 'bitrix/gpt-x',
        });

        const partCalls = calls.filter(isPartCall);
        expect(partCalls).toHaveLength(parts.length);
        for (const call of calls) {
            expect(call.domain).toBe(DOMAIN);
            expect(call.options).toEqual({
                model: 'bitrix/gpt-x',
                deferExhaustedAlert: true,
            });
        }
        expect(
            partCalls[0].user.startsWith(`ЧАСТЬ 1 ИЗ ${parts.length}:\n`),
        ).toBe(true);
        expect(partCalls[0].system).toContain(`№ 1 из ${parts.length}`);
    });

    it('сводка — после конспектов, по тексту «КОНСПЕКТ ПО ЧАСТЯМ»', async () => {
        const { service, calls } = makeLongCallService({ settings: MODE_ON });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        const summaryCalls = calls.filter(isSummaryCall);
        expect(summaryCalls).toHaveLength(1);
        expect(calls[calls.length - 1]).toBe(summaryCalls[0]);
        expect(summaryCalls[0].user.startsWith('КОНСПЕКТ ПО ЧАСТЯМ\n')).toBe(
            true,
        );
        expect(summaryCalls[0].user).toContain('Часть 1');
    });

    it('расход: число ответов в массиве равно числу удавшихся запросов', async () => {
        const { service, gateway } = makeLongCallService({ settings: MODE_ON });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(result?.completions).toHaveLength(parts.length + 1);
        expect(gateway.structuredCompletionWithUsage).toHaveBeenCalledTimes(
            parts.length + 1,
        );
        for (const completion of result!.completions) {
            expect(completion.usage.totalTokens).toBe(120);
        }
    });

    it('в журнал — одна строка на разговор: домен, части, запросы, кэш, время', async () => {
        const log = spyOnServiceLog();
        const { service } = makeLongCallService({ settings: MODE_ON });

        await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(log.log).toHaveBeenCalledTimes(1);
        const line = String(log.log.mock.calls[0][0]);
        expect(line).toContain(DOMAIN);
        expect(line).toContain(`частей ${parts.length}`);
        expect(line).toContain(`запросов ${parts.length + 1}, из кэша 0`);
        expect(line).toMatch(/\d+\.\d с$/);
    });
});
