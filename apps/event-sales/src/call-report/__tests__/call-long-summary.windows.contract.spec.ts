import { parseCallLongSummaryResponse } from '../contracts/call-long-summary.contract';
import {
    CONVERSATION_SUMMARY_LIMITS,
    LONG_CALL_DIRECTIONS,
} from '../long-call/long-call.const';
import { rawSummary, rawWindow, rawWindows } from './call-long-summary.fixture';

/** Один отрезок направления form после разбора. */
const formWindows = (
    window: Record<string, unknown>,
    durationSec: number | null,
) =>
    parseCallLongSummaryResponse(
        rawSummary({ windows: rawWindows({ form: [window] }) }),
        durationSec,
    )?.windows.form;

describe('parseCallLongSummaryResponse — отрезки сводки', () => {
    it('отрезок с fromSec не меньше toSec или с отрицательным fromSec отбрасывается', () => {
        expect(
            formWindows(rawWindow({ fromSec: 180, toSec: 180 }), 1200),
        ).toEqual([]);
        expect(
            formWindows(rawWindow({ fromSec: 200, toSec: 100 }), 1200),
        ).toEqual([]);
        expect(
            formWindows(rawWindow({ fromSec: -1, toSec: 50 }), 1200),
        ).toEqual([]);
    });

    it('отрезок с неконечными или нечисловыми секундами отбрасывается', () => {
        for (const bad of [NaN, Infinity, '100', null, undefined]) {
            expect(formWindows(rawWindow({ fromSec: bad }), 1200)).toEqual([]);
            expect(formWindows(rawWindow({ toSec: bad }), 1200)).toEqual([]);
        }
    });

    it('отрезок с 0 в начале допустим', () => {
        expect(formWindows(rawWindow({ fromSec: 0, toSec: 60 }), 1200)).toEqual(
            [{ fromSec: 0, toSec: 60, why: 'Вход в разговор' }],
        );
    });

    it('отрезок длиннее 120 секунд — toSec подрезается', () => {
        expect(
            formWindows(rawWindow({ fromSec: 100, toSec: 400 }), 1200),
        ).toEqual([{ fromSec: 100, toSec: 220, why: 'Вход в разговор' }]);
        expect(
            formWindows(rawWindow({ fromSec: 100, toSec: 220 }), 1200),
        ).toEqual([{ fromSec: 100, toSec: 220, why: 'Вход в разговор' }]);
    });

    it('отрезок вне записи отбрасывается; запас 90 секунд за концом допустим', () => {
        expect(
            formWindows(rawWindow({ fromSec: 1250, toSec: 1300 }), 1200),
        ).toEqual([]);
        expect(
            formWindows(rawWindow({ fromSec: 1190, toSec: 1290 }), 1200),
        ).toHaveLength(1);
        expect(
            formWindows(rawWindow({ fromSec: 1190, toSec: 1291 }), 1200),
        ).toEqual([]);
    });

    it('длительность неизвестна — по записи отрезки не проверяются', () => {
        expect(
            formWindows(rawWindow({ fromSec: 90_000, toSec: 90_060 }), null),
        ).toHaveLength(1);
        expect(
            formWindows(rawWindow({ fromSec: 90_000, toSec: 90_060 }), NaN),
        ).toHaveLength(1);
    });

    it('отрезков больше предела на направление — лишние с конца отбрасываются', () => {
        const windows = Array.from({ length: 9 }, (_, index) =>
            rawWindow({
                fromSec: index * 100,
                toSec: index * 100 + 50,
                why: `№${index}`,
            }),
        );
        const result = parseCallLongSummaryResponse(
            rawSummary({ windows: rawWindows({ content: windows }) }),
            1200,
        );

        expect(result?.windows.content).toHaveLength(
            CONVERSATION_SUMMARY_LIMITS.maxWindowsPerDirection,
        );
        expect(result?.windows.content[5].why).toBe('№5');
    });

    it('направления разбираются отдельно, неизвестное направление игнорируется', () => {
        const result = parseCallLongSummaryResponse(
            rawSummary({
                windows: {
                    ...rawWindows({
                        closing: [rawWindow({ fromSec: 1000, toSec: 1060 })],
                        methodology: [rawWindow({ fromSec: 10, toSec: 20 })],
                    }),
                    weather: [rawWindow()],
                },
            }),
            1200,
        );

        expect(result?.windows.closing).toHaveLength(1);
        expect(result?.windows.methodology).toHaveLength(1);
        expect(result?.windows.movement).toEqual([]);
        expect(Object.keys(result?.windows ?? {})).toEqual([
            ...LONG_CALL_DIRECTIONS,
        ]);
    });

    it('нет windows или направление не массив — пустые массивы всех пяти направлений', () => {
        const empty = {
            form: [],
            content: [],
            movement: [],
            closing: [],
            methodology: [],
        };

        expect(
            parseCallLongSummaryResponse(
                rawSummary({ windows: undefined }),
                1200,
            )?.windows,
        ).toEqual(empty);
        expect(
            parseCallLongSummaryResponse(rawSummary({ windows: 'нет' }), 1200)
                ?.windows,
        ).toEqual(empty);
        expect(
            parseCallLongSummaryResponse(
                rawSummary({ windows: rawWindows({ form: 'нет' }) }),
                1200,
            )?.windows.form,
        ).toEqual([]);
    });
});
