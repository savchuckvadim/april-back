import {
    CALL_LONG_PARTS_MODE_DEFAULT,
    CALL_LONG_SETTING_KEYS,
    LLM_GATEWAY_SETTING_KEYS,
    LLM_INTEGER_SETTING_RULES,
} from '../vendor-settings.llm';
import {
    VENDOR_SETTING_GROUP_INFO,
    VENDOR_SETTING_KEYS,
    vendorSettingOf,
} from '../vendor-settings.registry';

/**
 * Длинный разговор по частям: три настройки в группе шлюза модели
 * (26.11.2026). Общие проверки реестра (текст, пример, умолчание в
 * диапазоне, проверка чисел) — в vendor-settings.registry.spec.ts: новые
 * числа попадают в них через LLM_INTEGER_SETTING_RULES.
 */
describe('реестр: длинные разговоры по частям', () => {
    const LATIN = /[A-Za-z]/;

    it('три настройки — в группе шлюза, не секреты; режим по умолчанию выключен', () => {
        expect([...CALL_LONG_SETTING_KEYS]).toEqual([
            'CALL_LONG_PARTS_MODE',
            'CALL_LONG_THRESHOLD_CHARS',
            'CALL_LONG_PART_CHARS',
        ]);
        for (const key of CALL_LONG_SETTING_KEYS) {
            expect(LLM_GATEWAY_SETTING_KEYS).toContain(key);
            expect(VENDOR_SETTING_KEYS).toContain(key);
            expect(vendorSettingOf(key).group).toBe('llm-gateway');
            expect(VENDOR_SETTING_GROUP_INFO['llm-gateway']).toBeDefined();
            expect(vendorSettingOf(key).secret).toBe(false);
        }
        expect(CALL_LONG_PARTS_MODE_DEFAULT).toBe('off');
        expect(vendorSettingOf('CALL_LONG_PARTS_MODE').defaultValue).toBe(
            'off',
        );
        expect(vendorSettingOf('CALL_LONG_PARTS_MODE').example).toBe('off');
    });

    it('числа: порог 10 000…200 000 (25 000), часть 3 000…20 000 (9 000); умолчание видно в админке', () => {
        expect(LLM_INTEGER_SETTING_RULES.CALL_LONG_THRESHOLD_CHARS).toEqual({
            min: 10_000,
            max: 200_000,
            defaultValue: 25_000,
        });
        expect(LLM_INTEGER_SETTING_RULES.CALL_LONG_PART_CHARS).toEqual({
            min: 3_000,
            max: 20_000,
            defaultValue: 9_000,
        });
        expect(vendorSettingOf('CALL_LONG_THRESHOLD_CHARS').defaultValue).toBe(
            '25000',
        );
        expect(vendorSettingOf('CALL_LONG_PART_CHARS').defaultValue).toBe(
            '9000',
        );
    });

    it('проверка в админке: режим — off или on, числа — целые в диапазоне', () => {
        const mode = vendorSettingOf('CALL_LONG_PARTS_MODE').validate!;
        expect(mode('on')).toBeNull();
        expect(mode('off')).toBeNull();
        expect(mode('включено')).toBe('Допустимо: off или on');

        const threshold = vendorSettingOf(
            'CALL_LONG_THRESHOLD_CHARS',
        ).validate!;
        expect(threshold('25 000')).toBeNull();
        expect(threshold('9999')).toBe(
            'Нужно целое число от 10 000 до 200 000',
        );
        expect(threshold('200001')).toContain('Нужно целое число');

        const part = vendorSettingOf('CALL_LONG_PART_CHARS').validate!;
        expect(part('3000')).toBeNull();
        expect(part('2999')).toBe('Нужно целое число от 3 000 до 20 000');
        expect(part('двадцать')).toContain('Нужно целое число');
    });

    it('тексты для админки по-русски: в названии и описании нет латиницы, в подсказке — только on и off', () => {
        for (const key of CALL_LONG_SETTING_KEYS) {
            const setting = vendorSettingOf(key);
            expect(setting.label).not.toMatch(LATIN);
            expect(setting.description).not.toMatch(LATIN);
            expect(setting.howTo.replace(/\b(on|off)\b/g, '')).not.toMatch(
                LATIN,
            );
        }
    });
});
