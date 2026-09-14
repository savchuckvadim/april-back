import {
    isRegistryValue,
    registryDefault,
    registryRangeOf,
    registryValueReason,
} from '../params/registry.access';
import { findParam } from '../params/registry.const';

/**
 * Типизированный доступ к реестру: `registryDefault` отдаёт дефолт кода
 * (тип выводится из дескриптора), с запасным значением — мягко откатывается
 * на границе, а `isRegistryValue` проверяет значение по тому же дескриптору,
 * что и `resolveParam`.
 */
describe('registryDefault', () => {
    it('типизированный код отдаёт дефолт дескриптора', () => {
        const lambda: number = registryDefault('forget_lambda');
        const roster: boolean = registryDefault('roster_confirm_required');
        const stratum: string = registryDefault('norm_stratum');

        expect(lambda).toBe(findParam('forget_lambda')?.defaultValue);
        expect(lambda).toBe(0.85);
        expect(roster).toBe(false);
        expect(stratum).toBe('tenure');
    });

    it('порождённые коды рёбер и типов тоже типизированы', () => {
        const mu: number = registryDefault('mu_e2');
        const capCold: number = registryDefault('cap_cold');
        const durationPres: number = registryDefault(
            'duration_min_presentation',
        );

        expect(mu).toBe(0.47);
        expect(capCold).toBe(40);
        expect(durationPres).toBe(45);
    });

    it('с запасным значением: чужой код или чужой тип → запасное', () => {
        expect(registryDefault('нет_такого_кода', 7)).toBe(7);
        expect(registryDefault('forget_lambda', 'строка')).toBe('строка');
        expect(registryDefault('forget_lambda', 1)).toBe(0.85);
        expect(registryDefault('roster_confirm_required', true)).toBe(false);
    });

    it('без запасного значения чужой код — ошибка программиста', () => {
        expect(() => registryDefault('нет_такого_кода' as never)).toThrow(
            'нет_такого_кода',
        );
    });
});

describe('registryRangeOf и проверка значения', () => {
    it('диапазон берётся из дескриптора', () => {
        expect(registryRangeOf('lag_cdf_F')).toEqual([0, 1]);
        expect(registryRangeOf('cif_sale_inf')).toEqual([0.03, 0.3]);
        expect(registryRangeOf('norm_stratum')).toBeUndefined();
        expect(registryRangeOf('нет_такого_кода')).toBeUndefined();
    });

    it('isRegistryValue повторяет правила resolveParam', () => {
        expect(isRegistryValue('lag_cdf_F', 0.5)).toBe(true);
        expect(isRegistryValue('cif_sale_inf', 0.5)).toBe(false);
        expect(isRegistryValue('norm_stratum', 'level')).toBe(true);
        expect(isRegistryValue('norm_stratum', 'shoe-size')).toBe(false);
        expect(isRegistryValue('roster_confirm_required', 'true')).toBe(false);
    });

    it('registryValueReason называет причину, чужой код — unknown-code', () => {
        expect(registryValueReason('f_min', 0.2)).toBeUndefined();
        expect(registryValueReason('f_min', 0.9)).toBe('out-of-range');
        expect(registryValueReason('f_min', '0.2')).toBe('type-mismatch');
        expect(registryValueReason('holidays', '{')).toBe('invalid-value');
        expect(registryValueReason('нет_такого_кода', 1)).toBe('unknown-code');
    });
});
