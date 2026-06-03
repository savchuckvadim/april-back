import {
    BitrixAppCredentials,
    RefreshedBitrixToken,
} from '../domain/bitrix-app-credentials.interface';

/**
 * Узкий порт доступа к данным учёток приложения Bitrix.
 * Только то, что нужно для обновления токена — без агрегата
 * приложения, размещений, настроек и доменной модели портала.
 */
export abstract class BitrixAuthRepository {
    /** Расшифрованные учётные данные приложения по домену и коду. */
    abstract findCredentials(
        domain: string,
        code: string,
    ): Promise<BitrixAppCredentials | null>;

    /** Сохраняет обновлённый (зашифрованный) токен приложения. */
    abstract saveRefreshedToken(
        appId: bigint,
        token: RefreshedBitrixToken,
    ): Promise<void>;
}
