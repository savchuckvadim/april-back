import {
    callDurationSecOf,
    irrelevantStop,
    resolveAnalysisStop,
    shortCallStop,
} from '../services/call-duration-gate.util';

/** Пилот решения А.1: холодные от минуты, презентации от пяти. */
const BY_TYPE = { cold: 60, presentation: 300, default: 300 } as const;

const classified = (callType: string, confidence = 0.9) => ({
    callType,
    confidence,
    reason: 'тест',
});

describe('call-duration-gate: длительность на стадии анализа', () => {
    it('длительность из задачи старше строки; строка — запасной источник', () => {
        expect(callDurationSecOf(700, '120')).toBe(700);
        expect(callDurationSecOf(undefined, '120')).toBe(120);
        expect(callDurationSecOf(undefined, 45)).toBe(45);
    });

    it('неизвестная или мусорная длительность — null (судить не по чему)', () => {
        expect(callDurationSecOf(undefined, null)).toBeNull();
        expect(callDurationSecOf(undefined, '')).toBeNull();
        expect(callDurationSecOf(undefined, 'abc')).toBeNull();
        expect(callDurationSecOf(-5, undefined)).toBeNull();
    });
});

describe('call-duration-gate: порог ТИПА после классификации (А.1)', () => {
    it('неравномерная карта: 120 с холодного проходит, презентация — нет', () => {
        expect(shortCallStop(classified('cold'), 120, BY_TYPE)).toBeNull();

        const stop = shortCallStop(classified('presentation'), 120, BY_TYPE);
        expect(stop?.result).toEqual({ shortCall: true });
        expect(stop?.message).toContain('120 с < 300 с');
        expect(stop?.message).toContain('presentation');
    });

    it('звонок без типа (классификация не удалась) — порог ключа default', () => {
        expect(shortCallStop(null, 299, BY_TYPE)?.result).toEqual({
            shortCall: true,
        });
        expect(shortCallStop(null, 300, BY_TYPE)).toBeNull();
    });

    it('равномерная карта — поведение прежнее: один порог на все типы', () => {
        const uniform = { default: 300 };
        expect(shortCallStop(classified('cold'), 700, uniform)).toBeNull();
        expect(shortCallStop(classified('cold'), 299, uniform)?.result).toEqual(
            { shortCall: true },
        );
    });

    it('длительность неизвестна или карты нет — гейт не применяется (fail-open)', () => {
        expect(
            shortCallStop(classified('presentation'), null, BY_TYPE),
        ).toBeNull();
        expect(
            shortCallStop(classified('presentation'), 10, undefined),
        ).toBeNull();
        expect(shortCallStop(classified('presentation'), 10, {})).toBeNull();
    });
});

describe('call-duration-gate: нерелевантность', () => {
    it('уверенный irrelevant останавливает, неуверенный — идёт полным путём', () => {
        const stop = irrelevantStop(classified('irrelevant', 0.92), 0.7);
        expect(stop?.result).toEqual({ irrelevant: true });
        expect(stop?.message).toContain('0.92');

        expect(irrelevantStop(classified('irrelevant', 0.5), 0.7)).toBeNull();
        expect(irrelevantStop(classified('cold', 0.99), 0.7)).toBeNull();
        expect(irrelevantStop(null, 0.7)).toBeNull();
    });

    it('resolveAnalysisStop: нерелевантность старше порога длительности', () => {
        const settings = {
            irrelevantConfidence: 0.7,
            minDurationSecByType: BY_TYPE,
        };
        expect(
            resolveAnalysisStop({
                classification: classified('irrelevant', 0.9),
                durationSec: 30,
                settings,
            })?.result,
        ).toEqual({ irrelevant: true });
        expect(
            resolveAnalysisStop({
                classification: classified('presentation'),
                durationSec: 120,
                settings,
            })?.result,
        ).toEqual({ shortCall: true });
        expect(
            resolveAnalysisStop({
                classification: classified('cold'),
                durationSec: 120,
                settings,
            }),
        ).toBeNull();
    });
});
