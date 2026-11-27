import {
    KONSTRUKTOR_SETTING_KEYS,
    RABS_VAT_COEFFICIENT_DEFAULT,
    RABS_VAT_COEFFICIENT_KEY,
    parseRabsVatCoefficient,
    resolveRabsVatCoefficient,
} from '../vendor-settings.konstructor';
import {
    VENDOR_SECRET_KEYS,
    VENDOR_SETTING_GROUP_INFO,
    isVendorSettingKey,
    vendorSettingOf,
} from '../vendor-settings.registry';

/** Коэффициент НДС рабса: цена конструктора = рабс × коэффициент × остальные. */
describe('настройка: коэффициент НДС рабса', () => {
    it('описана в реестре: своя группа, открытое значение, умолчание 1.22 видно в админке', () => {
        const setting = vendorSettingOf(RABS_VAT_COEFFICIENT_KEY);
        expect(isVendorSettingKey('KONSTRUKTOR_RABS_VAT_COEFFICIENT')).toBe(
            true,
        );
        expect(KONSTRUKTOR_SETTING_KEYS).toContain(RABS_VAT_COEFFICIENT_KEY);
        expect(setting.group).toBe('konstructor');
        expect(VENDOR_SETTING_GROUP_INFO.konstructor.title).toContain(
            'Конструктор',
        );
        expect(setting.label).toBe('Конструктор КП: коэффициент НДС рабса');
        expect(setting.secret).toBe(false);
        expect(VENDOR_SECRET_KEYS).not.toContain(RABS_VAT_COEFFICIENT_KEY);
        expect(RABS_VAT_COEFFICIENT_DEFAULT).toBe(1.22);
        expect(setting.defaultValue).toBe('1.22');
        expect(setting.example).toBe('1.22');
    });

    it('проверка в админке: число больше 1 и не больше 2, запятая допустима', () => {
        const validate = vendorSettingOf(RABS_VAT_COEFFICIENT_KEY).validate!;
        expect(validate('1.22')).toBeNull();
        expect(validate('1,2')).toBeNull();
        expect(validate(' 1.205 ')).toBeNull();
        expect(validate('2')).toBeNull();
        expect(validate('1')).toContain('Нужно число больше 1');
        expect(validate('0.8')).toContain('Нужно число больше 1');
        // процент вместо множителя отсекается: цены выросли бы в 22 раза
        expect(validate('22')).toContain('Нужно число больше 1');
        expect(validate('1.2.3')).toContain('Нужно число больше 1');
        expect(validate('1e1')).toContain('Нужно число больше 1');
        expect(validate('двадцать два процента')).toContain(
            'Нужно число больше 1',
        );
    });

    it('parseRabsVatCoefficient: верное число или null', () => {
        expect(parseRabsVatCoefficient('1.22')).toBe(1.22);
        expect(parseRabsVatCoefficient('1,2')).toBe(1.2);
        expect(parseRabsVatCoefficient('1')).toBeNull();
        expect(parseRabsVatCoefficient('-1.5')).toBeNull();
        expect(parseRabsVatCoefficient('')).toBeNull();
        expect(parseRabsVatCoefficient(null)).toBeNull();
        expect(parseRabsVatCoefficient(undefined)).toBeNull();
    });

    it('resolveRabsVatCoefficient: пусто — умолчание без жалобы, неверное — умолчание с признаком', () => {
        expect(resolveRabsVatCoefficient(null)).toEqual({
            value: 1.22,
            invalid: false,
        });
        expect(resolveRabsVatCoefficient('   ')).toEqual({
            value: 1.22,
            invalid: false,
        });
        expect(resolveRabsVatCoefficient('1.2')).toEqual({
            value: 1.2,
            invalid: false,
        });
        expect(resolveRabsVatCoefficient('0.9')).toEqual({
            value: 1.22,
            invalid: true,
        });
        expect(resolveRabsVatCoefficient('abc')).toEqual({
            value: 1.22,
            invalid: true,
        });
    });
});
