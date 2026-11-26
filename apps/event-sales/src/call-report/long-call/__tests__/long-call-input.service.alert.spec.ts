import { LlmUnavailableError } from '@lib/llm-gateway';
import {
    DOMAIN,
    MODE_ON,
    defaultAnswer,
    defaultParts,
    isPartCall,
    isSummaryCall,
    makeLongCallService,
    partNumberOf,
    spyOnServiceLog,
    transcriptWithParts,
    type ModelHandler,
} from './long-call-input.service.fixture';
import { failingParts } from './long-call-input.service.handlers';

/**
 * LongCallInputService.prepare — тревога о сбое модели. Она одна на разговор
 * и уходит только тогда, когда длинный путь брошен (без конспекта больше
 * половины частей). Шлюз всегда откладывает свою тревогу: сервис не шлёт её
 * ни за отдельную часть, ни за сводку.
 */

const SIX_PARTS = transcriptWithParts(6);
const sixParts = defaultParts(SIX_PARTS);
const ALERT_REQUEST = { schemaName: 'call_long_part', domain: DOMAIN };

/** Отказ поставщиков; в тексте — номер вызова, чтобы отличать ошибки. */
const refusal = (index: number, transient: boolean): LlmUnavailableError =>
    new LlmUnavailableError(
        `отказ ${index}`,
        [{ provider: 'vibecode', transient }],
        'vibecode',
    );

/** Обработчик: на каждый запрос конспекта — отказ поставщиков, сводка — как обычно. */
const everyPartRefused =
    (transient: boolean): ModelHandler =>
    (call, index) => {
        if (isSummaryCall(call)) return defaultAnswer(call, index);
        throw refusal(index, transient);
    };

describe('LongCallInputService.prepare — одна тревога на разговор', () => {
    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('шесть частей для проверки есть', () => {
        expect(sixParts).toHaveLength(6);
    });

    it('полный отказ поставщика на шести частях — null и ровно одна тревога по первой ошибке', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: everyPartRefused(false),
        });

        const result = await service.prepare(DOMAIN, SIX_PARTS);

        expect(result).toBeNull();
        expect(calls.filter(isSummaryCall)).toHaveLength(0);
        expect(gateway.reportExhausted).toHaveBeenCalledTimes(1);
        expect(gateway.reportExhausted).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'отказ 1' }),
            ALERT_REQUEST,
        );
    });

    it('временный отказ на шести частях (с повторами) — по-прежнему одна тревога', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: everyPartRefused(true),
        });

        const result = await service.prepare(DOMAIN, SIX_PARTS);

        expect(result).toBeNull();
        // Каждая часть: попытка и один повтор.
        expect(calls.filter(isPartCall)).toHaveLength(sixParts.length * 2);
        expect(gateway.reportExhausted).toHaveBeenCalledTimes(1);
        expect(gateway.reportExhausted).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'отказ 1' }),
            ALERT_REQUEST,
        );
    });

    it('шлюзу всегда сказано откладывать тревогу — и на первой попытке, и на повторе', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: everyPartRefused(true),
        });

        await service.prepare(DOMAIN, SIX_PARTS);

        expect(calls.length).toBeGreaterThan(sixParts.length);
        for (const call of calls) {
            expect(call.options?.deferExhaustedAlert).toBe(true);
        }
    });

    it('одна часть из шести упала с отказом поставщиков — тревоги нет, результат есть', async () => {
        const { service, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: failingParts([3]),
        });

        const result = await service.prepare(DOMAIN, SIX_PARTS);

        expect(result?.report.partsWithoutDigest).toBe(1);
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('половина частей без конспекта — путь состоялся, тревоги нет', async () => {
        const { service, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: failingParts([1, 2, 3]),
        });

        const result = await service.prepare(DOMAIN, SIX_PARTS);

        expect(result?.report.partsWithoutDigest).toBe(3);
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('больше половины частей без конспекта — путь брошен, тревога одна', async () => {
        const { service, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: failingParts([1, 2, 3, 4]),
        });

        const result = await service.prepare(DOMAIN, SIX_PARTS);

        expect(result).toBeNull();
        expect(gateway.reportExhausted).toHaveBeenCalledTimes(1);
    });

    it('сбой сводки с отказом поставщиков — тревоги нет, hasSummary = false', async () => {
        const { service, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: (call, index) => {
                if (isSummaryCall(call)) throw refusal(index, true);

                return defaultAnswer(call, index);
            },
        });

        const result = await service.prepare(DOMAIN, SIX_PARTS);

        expect(result?.report.hasSummary).toBe(false);
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('запоминается первый отказ поставщиков, чужая ошибка до него не в счёт', async () => {
        const { service, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: (call, index) => {
                if (isSummaryCall(call)) return defaultAnswer(call, index);
                if (index === 1) throw new Error('что-то сломалось');
                throw refusal(index, false);
            },
        });

        await service.prepare(DOMAIN, SIX_PARTS);

        expect(gateway.reportExhausted).toHaveBeenCalledTimes(1);
        expect(gateway.reportExhausted).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'отказ 2' }),
            ALERT_REQUEST,
        );
    });

    it('чужие ошибки (не отказ поставщиков) на всех частях — null, тревоги нет', async () => {
        const { service, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: (call, index) => {
                if (isSummaryCall(call)) return defaultAnswer(call, index);
                throw new Error('что-то сломалось');
            },
        });

        expect(await service.prepare(DOMAIN, SIX_PARTS)).toBeNull();
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('сбой самой тревоги — в журнал, null возвращается как обычно', async () => {
        const log = spyOnServiceLog();
        const { service, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: everyPartRefused(false),
        });
        gateway.reportExhausted.mockRejectedValue(new Error('нет связи'));

        const result = await service.prepare(DOMAIN, SIX_PARTS);

        expect(result).toBeNull();
        expect(gateway.reportExhausted).toHaveBeenCalledTimes(1);
        expect(log.warn).toHaveBeenCalledWith(
            expect.stringContaining('тревога о сбое модели не отправлена'),
        );
    });

    it('каждая часть в полном отказе спрошена один раз при постоянной ошибке', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: everyPartRefused(false),
        });

        await service.prepare(DOMAIN, SIX_PARTS);

        const numbers = calls
            .filter(isPartCall)
            .map(partNumberOf)
            .sort((left, right) => left - right);
        expect(numbers).toEqual(sixParts.map(part => part.number));
    });
});
