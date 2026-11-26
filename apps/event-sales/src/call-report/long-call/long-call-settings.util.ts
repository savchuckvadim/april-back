import {
    CALL_LONG_PARTS_MODES,
    CALL_LONG_PARTS_MODE_DEFAULT,
    LLM_INTEGER_SETTING_RULES,
    integerSettingValue,
    type CallLongPartsMode,
} from '@lib/vendor-settings';
import { LONG_CALL_OVERLAP_DIVISOR } from './long-call.const';
import { isOneOf } from './long-call-parse.util';

/**
 * Три настройки разбора длинного разговора по частям из «Настроек
 * приложения» (группа «шлюз модели»): режим, порог длины и размер части.
 * Здесь — чистый разбор прочитанных значений; чтение из админки и env — в
 * LongCallInputService.
 */

const THRESHOLD_RULE = LLM_INTEGER_SETTING_RULES.CALL_LONG_THRESHOLD_CHARS;
const PART_RULE = LLM_INTEGER_SETTING_RULES.CALL_LONG_PART_CHARS;

/** Действующие настройки длинного разговора. */
export interface LongCallSettings {
    /** `off` — разговор уходит в модель целиком; `on` — режется на части. */
    mode: CallLongPartsMode;
    /** С какой длины расшифровки (знаков) разговор считается длинным. */
    thresholdChars: number;
    /** Размер одной части, знаков. */
    partChars: number;
}

/** Значения настроек по ключам, как их отдаёт читатель настроек вендора. */
export type LongCallSettingValues = Readonly<
    Record<string, string | null | undefined>
>;

/**
 * Значения настроек → действующие. Мусор вместо режима или числа — значение
 * по умолчанию; число вне диапазона — ближайшая граница (как у остальных
 * чисел шлюза).
 */
export function longCallSettingsOf(
    values: LongCallSettingValues,
): LongCallSettings {
    const mode = values.CALL_LONG_PARTS_MODE?.trim();

    return {
        mode: isOneOf(CALL_LONG_PARTS_MODES, mode)
            ? mode
            : CALL_LONG_PARTS_MODE_DEFAULT,
        thresholdChars: integerSettingValue(
            values.CALL_LONG_THRESHOLD_CHARS,
            THRESHOLD_RULE,
        ),
        partChars: integerSettingValue(values.CALL_LONG_PART_CHARS, PART_RULE),
    };
}

/** Перекрытие соседних частей при размере части: десятая доля, округлённая. */
export function overlapCharsFor(partChars: number): number {
    return Math.round(partChars / LONG_CALL_OVERLAP_DIVISOR);
}
