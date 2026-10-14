/**
 * Роль процесса приложения: рабочий прод («active») или тёплый резерв
 * («standby»).
 *
 * Зеркало на другом хостере поднимает те же образы, но пока жив прод оно
 * не должно действовать само: не крутить кроны и не разбирать очереди —
 * иначе два стека параллельно звонят в Битрикс, шлют уведомления и аудит
 * сделок. Перевод зеркала в «active» — шаг runbook переключения
 * (infra/mirror/README.md).
 */
export const APP_ROLE_ENV = 'APP_ROLE';

export const AppRole = {
    ACTIVE: 'active',
    STANDBY: 'standby',
} as const;

export type AppRole = (typeof AppRole)[keyof typeof AppRole];

export const APP_ROLE_VALUES: readonly AppRole[] = Object.values(AppRole);

const isAppRole = (value: string): value is AppRole =>
    (APP_ROLE_VALUES as readonly string[]).includes(value);

/**
 * Разбор значения `APP_ROLE`. Пусто — «active»: прод и локальный запуск
 * переменную не задают. Незнакомое значение — ошибка на старте: опечатка
 * в настройках зеркала не должна молча превратить резерв во второй прод.
 */
export const resolveAppRole = (raw: string | undefined): AppRole => {
    const value = raw?.trim().toLowerCase() ?? '';
    if (!value) {
        return AppRole.ACTIVE;
    }
    if (isAppRole(value)) {
        return value;
    }
    throw new Error(
        `${APP_ROLE_ENV}="${raw}" не распознан: допустимо ` +
            APP_ROLE_VALUES.join(' | '),
    );
};

/** Роль текущего процесса — из окружения. */
export const currentAppRole = (): AppRole =>
    resolveAppRole(process.env[APP_ROLE_ENV]);
