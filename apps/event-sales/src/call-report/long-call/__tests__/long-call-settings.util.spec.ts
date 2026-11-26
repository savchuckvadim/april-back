import { LLM_INTEGER_SETTING_RULES } from '@lib/vendor-settings';
import {
    LONG_CALL_OVERLAP_CHARS,
    LONG_CALL_PART_CHARS,
    LONG_CALL_THRESHOLD_CHARS,
} from '../long-call.const';
import {
    longCallSettingsOf,
    overlapCharsFor,
} from '../long-call-settings.util';

/**
 * Три настройки длинного разговора: разбор прочитанных значений и
 * согласованность умолчаний с константами 4а (одно место правды).
 */
describe('longCallSettingsOf', () => {
    it('ничего не задано — режим выключен, порог 25 000, часть 9 000', () => {
        expect(longCallSettingsOf({})).toEqual({
            mode: 'off',
            thresholdChars: 25_000,
            partChars: 9_000,
        });
    });

    it('все значения null — умолчания', () => {
        expect(
            longCallSettingsOf({
                CALL_LONG_PARTS_MODE: null,
                CALL_LONG_THRESHOLD_CHARS: null,
                CALL_LONG_PART_CHARS: null,
            }),
        ).toEqual(longCallSettingsOf({}));
    });

    it('заданные значения действуют: режим on, порог и часть — числа', () => {
        expect(
            longCallSettingsOf({
                CALL_LONG_PARTS_MODE: 'on',
                CALL_LONG_THRESHOLD_CHARS: '40000',
                CALL_LONG_PART_CHARS: '12 000',
            }),
        ).toEqual({ mode: 'on', thresholdChars: 40_000, partChars: 12_000 });
    });

    it('пробелы вокруг режима не мешают', () => {
        expect(longCallSettingsOf({ CALL_LONG_PARTS_MODE: ' on ' }).mode).toBe(
            'on',
        );
    });

    it('мусор вместо режима — выключено; вместо чисел — умолчания', () => {
        expect(
            longCallSettingsOf({
                CALL_LONG_PARTS_MODE: 'включить',
                CALL_LONG_THRESHOLD_CHARS: 'много',
                CALL_LONG_PART_CHARS: '',
            }),
        ).toEqual({ mode: 'off', thresholdChars: 25_000, partChars: 9_000 });
        expect(longCallSettingsOf({ CALL_LONG_PARTS_MODE: 'ON' }).mode).toBe(
            'off',
        );
        expect(longCallSettingsOf({ CALL_LONG_PARTS_MODE: 'true' }).mode).toBe(
            'off',
        );
    });

    it('число вне диапазона — ближайшая граница', () => {
        const rules = LLM_INTEGER_SETTING_RULES;

        expect(
            longCallSettingsOf({ CALL_LONG_THRESHOLD_CHARS: '1' })
                .thresholdChars,
        ).toBe(rules.CALL_LONG_THRESHOLD_CHARS.min);
        expect(
            longCallSettingsOf({ CALL_LONG_THRESHOLD_CHARS: '9999999' })
                .thresholdChars,
        ).toBe(rules.CALL_LONG_THRESHOLD_CHARS.max);
        expect(
            longCallSettingsOf({ CALL_LONG_PART_CHARS: '100' }).partChars,
        ).toBe(rules.CALL_LONG_PART_CHARS.min);
        expect(
            longCallSettingsOf({ CALL_LONG_PART_CHARS: '50000' }).partChars,
        ).toBe(rules.CALL_LONG_PART_CHARS.max);
    });
});

describe('умолчания: настройки вендора и константы 4а — одно место правды', () => {
    it('константы приложения равны умолчаниям настроек', () => {
        const defaults = longCallSettingsOf({});

        expect(LONG_CALL_THRESHOLD_CHARS).toBe(defaults.thresholdChars);
        expect(LONG_CALL_PART_CHARS).toBe(defaults.partChars);
        expect(LONG_CALL_THRESHOLD_CHARS).toBe(
            LLM_INTEGER_SETTING_RULES.CALL_LONG_THRESHOLD_CHARS.defaultValue,
        );
    });

    it('перекрытие по умолчанию — функция от размера части по умолчанию (900)', () => {
        expect(overlapCharsFor(LONG_CALL_PART_CHARS)).toBe(
            LONG_CALL_OVERLAP_CHARS,
        );
        expect(LONG_CALL_OVERLAP_CHARS).toBe(900);
    });
});

describe('overlapCharsFor', () => {
    it('десятая часть размера части', () => {
        expect(overlapCharsFor(9_000)).toBe(900);
        expect(overlapCharsFor(3_000)).toBe(300);
        expect(overlapCharsFor(20_000)).toBe(2_000);
    });

    it('округляет до целого', () => {
        expect(overlapCharsFor(4_567)).toBe(457);
        expect(overlapCharsFor(4_564)).toBe(456);
        expect(Number.isInteger(overlapCharsFor(3_333))).toBe(true);
    });
});
