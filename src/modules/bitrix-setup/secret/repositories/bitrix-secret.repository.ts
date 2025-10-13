import { BitrixSecretEntity } from '../model/bitrix-secret.model';

export abstract class BitrixSecretRepository {
    // BitrixSecret methods
    abstract storeOrUpdate(secret: Partial<BitrixSecretEntity>): Promise<BitrixSecretEntity | null>;
    abstract findById(id: bigint): Promise<BitrixSecretEntity | null>;
    abstract findByCode(code: string): Promise<BitrixSecretEntity | null>;
    abstract delete(id: bigint): Promise<boolean>;
}
