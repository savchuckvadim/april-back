import { parseCallLongSummaryResponse } from '../contracts/call-long-summary.contract';
import { CONVERSATION_SUMMARY_LIMITS } from '../long-call/long-call.const';
import {
    rawSummary,
    rawThread,
    rawWindow,
    rawWindows,
} from './call-long-summary.fixture';

describe('parseCallLongSummaryResponse — разбор и чистка ответа', () => {
    it('хороший ответ разбирается без изменений', () => {
        expect(parseCallLongSummaryResponse(rawSummary(), 1200)).toEqual({
            story: 'Начали с задачи клиента, показали систему, договорились о счёте.',
            threads: [
                {
                    kind: 'objection',
                    topic: 'Цена слишком высокая',
                    status: 'resolved',
                    moments: [300, 900],
                    note: 'Менеджер назвал рассрочку, клиент согласился.',
                },
            ],
            result: 'Договорились о счёте.',
            endedAbruptly: false,
            windows: {
                form: [{ fromSec: 100, toSec: 180, why: 'Вход в разговор' }],
                content: [],
                movement: [],
                closing: [],
                methodology: [],
            },
        });
    });

    it.each([[null], [undefined], ['текст'], [42], [[]], [true]])(
        'ответ не объект (%p) — null',
        raw => {
            expect(parseCallLongSummaryResponse(raw, 1200)).toBeNull();
        },
    );

    it('нет story (пусто, пробелы, не строка) — null', () => {
        for (const story of [undefined, '', '   ', 7]) {
            expect(
                parseCallLongSummaryResponse(rawSummary({ story }), 1200),
            ).toBeNull();
        }
    });

    it('строки обрезаются до пределов и теряют крайние пробелы', () => {
        const summary = parseCallLongSummaryResponse(
            rawSummary({
                story: `  ${'с'.repeat(3000)}  `,
                result: 'р'.repeat(1000),
                threads: [
                    rawThread({
                        topic: ` ${'т'.repeat(200)} `,
                        note: 'п'.repeat(1000),
                    }),
                ],
                windows: rawWindows({
                    form: [rawWindow({ why: 'з'.repeat(500) })],
                }),
            }),
            1200,
        );

        expect(summary?.story).toBe(
            'с'.repeat(CONVERSATION_SUMMARY_LIMITS.storyChars),
        );
        expect(summary?.result).toBe(
            'р'.repeat(CONVERSATION_SUMMARY_LIMITS.resultChars),
        );
        expect(summary?.threads[0].topic).toBe(
            'т'.repeat(CONVERSATION_SUMMARY_LIMITS.topicChars),
        );
        expect(summary?.threads[0].note).toBe(
            'п'.repeat(CONVERSATION_SUMMARY_LIMITS.threadNoteChars),
        );
        expect(summary?.windows.form[0].why).toBe(
            'з'.repeat(CONVERSATION_SUMMARY_LIMITS.windowWhyChars),
        );
    });

    describe('линии', () => {
        it('неизвестный вид или статус — линия отбрасывается', () => {
            const summary = parseCallLongSummaryResponse(
                rawSummary({
                    threads: [
                        rawThread({ kind: 'weather', topic: 'вид' }),
                        rawThread({ status: 'maybe', topic: 'статус' }),
                        rawThread({ kind: 3, topic: 'число' }),
                        'не линия',
                        rawThread({ topic: 'верная' }),
                    ],
                }),
                1200,
            );

            expect(summary?.threads.map(thread => thread.topic)).toEqual([
                'верная',
            ]);
        });

        it('линий больше предела — лишние с конца отбрасываются', () => {
            const threads = Array.from({ length: 20 }, (_, index) =>
                rawThread({ topic: `линия ${index}` }),
            );
            const summary = parseCallLongSummaryResponse(
                rawSummary({ threads }),
                1200,
            );

            expect(summary?.threads).toHaveLength(
                CONVERSATION_SUMMARY_LIMITS.maxThreads,
            );
            expect(summary?.threads[11].topic).toBe('линия 11');
        });

        it('нет массива threads — пустой список', () => {
            expect(
                parseCallLongSummaryResponse(
                    rawSummary({ threads: 'нет' }),
                    1200,
                )?.threads,
            ).toEqual([]);
        });

        it('moments — только конечные неотрицательные числа, по возрастанию, без повторов', () => {
            const summary = parseCallLongSummaryResponse(
                rawSummary({
                    threads: [
                        rawThread({
                            moments: [
                                900,
                                300,
                                -5,
                                '600',
                                NaN,
                                Infinity,
                                300,
                                null,
                                450.5,
                                0,
                            ],
                        }),
                    ],
                }),
                1200,
            );

            expect(summary?.threads[0].moments).toEqual([0, 300, 450.5, 900]);
        });

        it('moments не массив — пустой массив', () => {
            const summary = parseCallLongSummaryResponse(
                rawSummary({ threads: [rawThread({ moments: 'нет' })] }),
                1200,
            );

            expect(summary?.threads[0].moments).toEqual([]);
        });
    });

    it('endedAbruptly не boolean — false; true остаётся true', () => {
        const endedOf = (endedAbruptly: unknown): boolean | undefined =>
            parseCallLongSummaryResponse(rawSummary({ endedAbruptly }), 1200)
                ?.endedAbruptly;

        expect(endedOf(true)).toBe(true);
        expect(endedOf(false)).toBe(false);
        expect(endedOf('true')).toBe(false);
        expect(endedOf(1)).toBe(false);
        expect(endedOf(null)).toBe(false);
        expect(endedOf(undefined)).toBe(false);
    });
});
