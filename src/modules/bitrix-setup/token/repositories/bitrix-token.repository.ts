import { BitrixTokenEntity } from '../model/bitrix-token.model';

export abstract class BitrixTokenRepository {
    // BitrixToken methods
    abstract storeOrUpdate(token: Partial<BitrixTokenEntity>): Promise<BitrixTokenEntity | null>;
    abstract storeOrUpdateSecrets(bitrix_app_id: bigint, client_id: string, client_secret: string): Promise<BitrixTokenEntity | null>;
    abstract storeOrUpdateTokensWithoutSecrets(bitrix_app_id: bigint, access_token: string, refresh_token: string, expires_at: Date, application_token: string, member_id: string): Promise<BitrixTokenEntity | null>;

    abstract findById(id: bigint): Promise<BitrixTokenEntity | null>;
    abstract findByAppId(appId: bigint): Promise<BitrixTokenEntity | null>;
    abstract delete(id: bigint): Promise<boolean>;
}
