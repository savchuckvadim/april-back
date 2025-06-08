import { ProviderEntityWithRq, RqEntity } from "./provider.entity";


export abstract class ProviderRepository {
    // abstract create(infoblock: Partial<InfoblockEntity>): Promise<InfoblockEntity | null>;
    abstract findById(id: number): Promise<RqEntity | null>;
    abstract findByDomain(code: string): Promise<ProviderEntityWithRq[] | null>;
    // abstract findByCodes(codes: string[]): Promise<InfoblockEntity[] | null>;
    abstract findMany(): Promise<RqEntity[] | null>;
}