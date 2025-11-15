import { BitrixAppEntity } from '../model/bitrix-app.model';

export abstract class BitrixAppRepository {
    // BitrixApp methods
    abstract storeOrUpdate(app: Partial<BitrixAppEntity>): Promise<BitrixAppEntity | null>;
    abstract update(id: bigint, data: Partial<BitrixAppEntity>): Promise<BitrixAppEntity>;
    abstract findById(id: bigint): Promise<BitrixAppEntity | null>;
    abstract findMany(): Promise<BitrixAppEntity[] | null>;
    abstract findByCode(code: string): Promise<BitrixAppEntity | null>;
    abstract findByCodeAndDomain(code: string, domain: string): Promise<BitrixAppEntity | null>;
    abstract findByPortal(domain: string): Promise<BitrixAppEntity[] | null>;
    abstract findByPortalId(portalId: number): Promise<BitrixAppEntity[] | null>;
    abstract delete(id: bigint): Promise<boolean>;
}
