/**
 * Расшифрованные учётные данные приложения Bitrix для одного портала.
 * Внутренняя модель libs/bitrix-auth — ровно то, что нужно для
 * проверки срока жизни и обновления OAuth-токена.
 */
export interface BitrixAppCredentials {
    appId: bigint;
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    applicationToken: string;
    memberId: string;
    expiresAt?: Date;
}

/** Данные обновлённого токена для сохранения в БД. */
export interface RefreshedBitrixToken {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    applicationToken: string;
    memberId: string;
}
