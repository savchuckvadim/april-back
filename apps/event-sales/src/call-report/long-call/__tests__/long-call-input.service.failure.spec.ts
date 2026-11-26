import 'reflect-metadata';
import { Semaphore } from '@lib/shared';
import {
    DOMAIN,
    LONG_TRANSCRIPT,
    MODE_ON,
    defaultParts,
    isSummaryCall,
    makeLongCallService,
    permanentError,
    rawSummary,
    spyOnServiceLog,
    transcriptWithParts,
    transientError,
} from './long-call-input.service.fixture';
import {
    failingParts,
    summaryHandler,
} from './long-call-input.service.handlers';

/**
 * LongCallInputService.prepare — длинный путь не удался и сбои сводки: без
 * конспекта больше половины частей — null; сводка не вышла — результат без неё.
 */

describe('LongCallInputService.prepare — длинный путь не удался', () => {
    const FOUR_PARTS = transcriptWithParts(4);
    const fourParts = defaultParts(FOUR_PARTS);
    const half = fourParts.length / 2;
    const numbers = fourParts.map(part => part.number);

    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('без конспекта больше половины частей — null и предупреждение, сводку не просили', async () => {
        const log = spyOnServiceLog();
        const failing = numbers.slice(0, half + 1);
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: failingParts(failing),
        });

        const result = await service.prepare(DOMAIN, FOUR_PARTS);

        expect(result).toBeNull();
        expect(calls.filter(isSummaryCall)).toHaveLength(0);
        expect(log.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                `без конспекта ${failing.length} частей из ${fourParts.length}`,
            ),
        );
    });

    it('ровно половина частей без конспекта — путь ещё идёт', async () => {
        const failing = numbers.slice(0, half);
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: failingParts(failing),
        });

        const result = await service.prepare(DOMAIN, FOUR_PARTS);

        expect(result?.report.partsWithoutDigest).toBe(half);
        expect(calls.filter(isSummaryCall)).toHaveLength(1);
    });

    it('неожиданное исключение внутри подготовки — null и предупреждение, а не падение разбора', async () => {
        const log = spyOnServiceLog();
        jest.spyOn(Semaphore.prototype, 'run').mockImplementation(() => {
            throw new TypeError('нарушен порядок');
        });
        const { service } = makeLongCallService({ settings: MODE_ON });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(result).toBeNull();
        expect(log.warn).toHaveBeenCalledWith(
            expect.stringContaining('подготовка не удалась'),
        );
    });
});

describe('LongCallInputService.prepare — сводка разговора', () => {
    beforeEach(() => {
        spyOnServiceLog();
    });
    afterEach(() => jest.restoreAllMocks());

    it('сводка не удалась (две ошибки) — результат есть, hasSummary = false, тревоги нет', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: summaryHandler(() => {
                throw transientError();
            }),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(calls.filter(isSummaryCall)).toHaveLength(2);
        expect(result).not.toBeNull();
        expect(result?.report.hasSummary).toBe(false);
        expect(result?.report.threadsCount).toBe(0);
        expect(result?.texts.form).toContain('КОНСПЕКТ ПО ЧАСТЯМ');
        expect(result?.texts.form).not.toContain('СВОДКА РАЗГОВОРА');
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('постоянная ошибка сводки — без повтора, hasSummary = false, тревоги нет: путь состоялся', async () => {
        const { service, calls, gateway } = makeLongCallService({
            settings: MODE_ON,
            handler: summaryHandler(() => {
                throw permanentError();
            }),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(calls.filter(isSummaryCall)).toHaveLength(1);
        expect(result?.report.hasSummary).toBe(false);
        expect(gateway.reportExhausted).not.toHaveBeenCalled();
    });

    it('сводка не разобралась — один повтор, он удался', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: summaryHandler(attempt =>
                attempt === 1 ? { threads: [] } : rawSummary(),
            ),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(calls.filter(isSummaryCall)).toHaveLength(2);
        expect(result?.report.hasSummary).toBe(true);
        expect(result?.texts.form).toContain('СВОДКА РАЗГОВОРА');
    });

    it('сводка не разобралась и после повтора — hasSummary = false', async () => {
        const { service, calls } = makeLongCallService({
            settings: MODE_ON,
            handler: summaryHandler(() => 'не JSON'),
        });

        const result = await service.prepare(DOMAIN, LONG_TRANSCRIPT);

        expect(calls.filter(isSummaryCall)).toHaveLength(2);
        expect(result?.report.hasSummary).toBe(false);
    });
});
