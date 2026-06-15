/**
 * Конфигурация auth-библиотеки. Собирается из переменных окружения
 * приложения-потребителя ({@link buildAuthOptions}) с возможностью точечного
 * переопределения через {@link AuthModule.forRoot}.
 */
export interface AuthModuleOptions {
    /** Глобальный выключатель. `false` — auth полностью отключён, всё работает как раньше. */
    enabled: boolean;
    /** Параметры подписи/проверки JWT (общий секрет = SSO между приложениями). */
    jwt: {
        secret: string;
        expiresIn: string;
    };
    /** Учётные данные единственного администратора (SuperUser). */
    superUser: {
        login: string;
        /** bcrypt-хэш пароля (НЕ открытый текст). */
        passwordHash: string;
    };
    /**
     * Пути (по началу `request.path`), которые гард пропускает без токена,
     * не требуя декоратора `@Public()` на контроллере. Нужно для инфраструктурных
     * эндпоинтов из общих библиотек (напр. health-check из `@lib/core`).
     */
    publicPaths: string[];
}

/** Частичное переопределение опций, принимаемое {@link AuthModule.forRoot}. */
export interface AuthForRootOptions {
    enabled?: boolean;
    jwt?: Partial<AuthModuleOptions['jwt']>;
    superUser?: Partial<AuthModuleOptions['superUser']>;
    publicPaths?: string[];
}

/**
 * Дефолтный секрет для локальной разработки. В проде ОБЯЗАТЕЛЬНО задаётся
 * `AUTH_JWT_SECRET` — общий для всех приложений монорепо (даёт сквозной SSO).
 */
const DEV_INSECURE_SECRET = 'dev-insecure-auth-secret-change-me';

/**
 * Собирает итоговые опции: env-значения как база, `override` — поверх них.
 * Вызывается синхронно в момент `AuthModule.forRoot()`.
 */
export function buildAuthOptions(
    override: AuthForRootOptions = {},
): AuthModuleOptions {
    return {
        enabled: override.enabled ?? process.env.AUTH_ENABLED === 'true',
        jwt: {
            secret:
                override.jwt?.secret ??
                process.env.AUTH_JWT_SECRET ??
                process.env.APP_SECRET_KEY ??
                DEV_INSECURE_SECRET,
            expiresIn:
                override.jwt?.expiresIn ??
                process.env.AUTH_JWT_EXPIRES_IN ??
                '12h',
        },
        superUser: {
            login:
                override.superUser?.login ?? process.env.SUPERUSER_LOGIN ?? '',
            passwordHash:
                override.superUser?.passwordHash ??
                process.env.SUPERUSER_PASSWORD ??
                '',
        },
        publicPaths: override.publicPaths ?? ['/api/health'],
    };
}
