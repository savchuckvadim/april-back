import {
    APP_ROLE_ENV,
    AppRole,
    currentAppRole,
    resolveAppRole,
} from '../app-role';

describe('resolveAppRole', () => {
    it('пустое значение — active (прод и локальный запуск ничего не задают)', () => {
        expect(resolveAppRole(undefined)).toBe(AppRole.ACTIVE);
        expect(resolveAppRole('')).toBe(AppRole.ACTIVE);
        expect(resolveAppRole('   ')).toBe(AppRole.ACTIVE);
    });

    it('принимает active и standby без учёта регистра и пробелов', () => {
        expect(resolveAppRole('active')).toBe(AppRole.ACTIVE);
        expect(resolveAppRole(' Standby ')).toBe(AppRole.STANDBY);
        expect(resolveAppRole('STANDBY')).toBe(AppRole.STANDBY);
    });

    it('незнакомое значение — ошибка с именем переменной и допустимыми значениями', () => {
        expect(() => resolveAppRole('prod')).toThrow(
            `${APP_ROLE_ENV}="prod" не распознан: допустимо active | standby`,
        );
    });
});

describe('currentAppRole', () => {
    const original = process.env[APP_ROLE_ENV];

    afterEach(() => {
        if (original === undefined) {
            delete process.env[APP_ROLE_ENV];
        } else {
            process.env[APP_ROLE_ENV] = original;
        }
    });

    it('читает роль из окружения', () => {
        process.env[APP_ROLE_ENV] = 'standby';
        expect(currentAppRole()).toBe(AppRole.STANDBY);
        delete process.env[APP_ROLE_ENV];
        expect(currentAppRole()).toBe(AppRole.ACTIVE);
    });
});
