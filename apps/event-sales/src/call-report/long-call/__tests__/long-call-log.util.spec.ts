import { LONG_CALL_CONSUMERS } from '../long-call-consumers.const';
import type { LongCallInputReport } from '../long-call-input.types';
import { formatLongCallLog } from '../long-call-log.util';

/** Строка журнала по длинному разговору: всё, что просили записать, в одну строку. */
const report = (
    overrides: Partial<LongCallInputReport> = {},
): LongCallInputReport => ({
    partsCount: 7,
    partsWithoutDigest: 1,
    eventsCount: 24,
    threadsCount: 5,
    hasSummary: true,
    consumers: Object.fromEntries(
        Object.keys(LONG_CALL_CONSUMERS).map((consumer, index) => [
            consumer,
            { textChars: 1_000 * (index + 1), droppedExcerpts: 0 },
        ]),
    ) as LongCallInputReport['consumers'],
    ...overrides,
});

describe('formatLongCallLog', () => {
    const line = formatLongCallLog({
        domain: 'test.bitrix24.ru',
        transcriptChars: 61_234,
        report: report(),
        requests: 9,
        cacheHits: 3,
        seconds: '12.4',
    });

    it('одна строка', () => {
        expect(line).not.toContain('\n');
    });

    it('домен, знаки расшифровки, части, события, линии, сводка', () => {
        expect(line).toContain('test.bitrix24.ru');
        expect(line).toContain('расшифровка 61234 зн.');
        expect(line).toContain('частей 7');
        expect(line).toContain('без конспекта 1');
        expect(line).toContain('событий 24');
        expect(line).toContain('линий 5');
        expect(line).toContain('сводка есть');
    });

    it('длины текстов по каждому потребителю', () => {
        for (const [index, consumer] of Object.keys(
            LONG_CALL_CONSUMERS,
        ).entries()) {
            expect(line).toContain(`${consumer} ${1_000 * (index + 1)}`);
        }
    });

    it('запросы, кэш и время в секундах', () => {
        expect(line).toContain('запросов 9, из кэша 3');
        expect(line.endsWith('12.4 с')).toBe(true);
    });

    it('сводки нет — так и написано', () => {
        const without = formatLongCallLog({
            domain: 'd',
            transcriptChars: 1,
            report: report({ hasSummary: false }),
            requests: 0,
            cacheHits: 0,
            seconds: '0.0',
        });

        expect(without).toContain('сводка нет');
    });
});
