import { PortalEntity } from './portal.entity';
import { PortalKeyName, PortalKeysRecord } from './keys/portal-key.const';

export abstract class PortalRepository {
    abstract create(
        portal: Partial<PortalEntity>,
    ): Promise<PortalEntity | null>;
    abstract update(
        portal: Partial<PortalEntity>,
    ): Promise<PortalEntity | null>;
    abstract delete(id: number): Promise<void>;
    abstract deleteByClientId(clientId: number): Promise<void>;
    abstract findById(id: number): Promise<PortalEntity | null>;
    abstract findByClientId(clientId: number): Promise<PortalEntity[] | null>;
    abstract findMany(): Promise<PortalEntity[] | null>;
    abstract findManyWithRelations(): Promise<PortalEntity[] | null>;
    abstract findByDomain(domain: string): Promise<PortalEntity | null>;
    abstract updateWebhook(
        domain: string,
        webhook: string,
    ): Promise<PortalEntity | null>;

    /**
     * Возвращает все ключи интеграций портала «как есть» (в зашифрованном
     * виде) или `null`, если портал не найден.
     */
    abstract findKeysById(id: number): Promise<PortalKeysRecord | null>;

    /**
     * Записывает значение одного ключа портала. `value` уже должен быть
     * зашифрован; `null` очищает ключ.
     */
    abstract updateKey(
        id: number,
        key: PortalKeyName,
        value: string | null,
    ): Promise<void>;
}
