import {
    DOMAIN,
    LONG_TRANSCRIPT,
    MODE_ON,
    defaultParts,
    makeLongCallService,
    partNumberOf,
    permanentError,
    rawDigest,
    rawEmptyDigest,
    spyOnServiceLog,
    transientError,
} from './long-call-input.service.fixture';
import {
    TARGET_PART,
    failingParts,
    partCallCount,
    targetPartHandler,
} from './long-call-input.service.handlers';

/**
 * LongCallInputService.prepare — повторы конспекта части. На часть — не
 * больше двух запросов; временная ошибка, неразобранный ответ и
 * «подозрительно пустой» конспект повторяются один раз.
 */

const parts = defaultParts(LONG_TRANSCRIPT);

describe('LongCallInputService.prepare — повторы конспекта части', () => {
    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('временная ошибка — один повтор, он удался: конспект есть', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(attempt => {
                if (attempt === 1) throw transientError();

                return rawDigest();
            }),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(2);
        expect(result?.report.partsWithoutDigest).toBe(0);
        // Сорвавшийся запрос расхода не даёт: части + повтор уже в частях + сводка.
        expect(result?.completions).toHaveLength(parts.length + 1);
        // Тревогу шлюз откладывает и на первой попытке, и на повторе.
        const options = calls
            .filter(call => partNumberOf(call) === TARGET_PART)
            .map(call => call.options?.deferExhaustedAlert);
        expect(options).toEqual([true, true]);
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('временная ошибка и на повторе — части без конспекта, больше двух запросов не было', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(() => {
                throw transientError();
            }),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(2);
        expect(result?.report.partsWithoutDigest).toBe(1);
        // Путь состоялся (не удалась одна часть из многих) — тревоги нет.
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('постоянная ошибка — без повтора, часть без конспекта, тревоги нет: путь состоялся', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(() => {
                throw permanentError();
            }),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(1);
        expect(result?.report.partsWithoutDigest).toBe(1);
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('чужая ошибка (не отказ поставщиков) — без повтора и без тревоги', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(() => {
                throw new Error('что-то сломалось');
            }),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(1);
        expect(result?.report.partsWithoutDigest).toBe(1);
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('пустой конспект содержательной части — один повтор; повтор хороший — берём его', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(attempt =>
                attempt === 1 ? rawEmptyDigest() : rawDigest(),
            ),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(2);
        expect(result?.report.partsWithoutDigest).toBe(0);
        // События есть: по одному на часть из ответа по умолчанию.
        expect(result?.report.eventsCount).toBeGreaterThan(0);
        expect(result?.completions).toHaveLength(parts.length + 2);
    });

    it('пустой конспект и после повтора — принимаем пустой, третьего запроса нет', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(() => rawEmptyDigest()),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(2);
        expect(result?.report.partsWithoutDigest).toBe(0);
        expect(result?.texts.whole).toContain(`Часть ${TARGET_PART}`);
        expect(result?.texts.whole).not.toContain('конспекта нет');
    });

    it('пустой конспект, а повтор оборвался ошибкой — остаётся пустой, а не «без конспекта»', async () => {
        const { service } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(attempt => {
                if (attempt === 1) return rawEmptyDigest();
                throw permanentError();
            }),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(result?.report.partsWithoutDigest).toBe(0);
    });

    it('ответ не разобрался (не объект) — один повтор, он удался', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(attempt =>
                attempt === 1 ? 'просто текст' : rawDigest(),
            ),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(2);
        expect(result?.report.partsWithoutDigest).toBe(0);
        // Неразобранный ответ — это всё равно удавшийся запрос с расходом.
        expect(result?.completions).toHaveLength(parts.length + 2);
    });

    it('ответ без summary не разобрался и после повтора — часть без конспекта', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: targetPartHandler(() => ({ events: [] })),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(partCallCount(calls, TARGET_PART)).toBe(2);
        expect(result?.report.partsWithoutDigest).toBe(1);
    });

    it('часть без конспекта: её текст идёт в отрывки целиком', async () => {
        const { service } = makeLongCallService({
            settings: MODE_ON,
            handler: failingParts([TARGET_PART]),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(result?.texts.whole).toContain(`Часть ${TARGET_PART}`);
        expect(result?.texts.whole).toContain(
            `часть ${TARGET_PART}, конспекта нет`,
        );
    });
});
