import { BitrixTokenEntity } from '../model/bitrix-token.model';

export abstract class BitrixTokenRepository {
    // BitrixToken methods
    abstract storeOrUpdate(token: Partial<BitrixTokenEntity>): Promise<BitrixTokenEntity | null>;
    abstract findById(id: bigint): Promise<BitrixTokenEntity | null>;
    abstract findByAppId(appId: bigint): Promise<BitrixTokenEntity | null>;
    abstract delete(id: bigint): Promise<boolean>;
}
