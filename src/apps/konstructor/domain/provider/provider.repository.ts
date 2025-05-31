import { RqEntity } from "./provider.entity";


export abstract class ProviderRepository {
    // abstract create(infoblock: Partial<InfoblockEntity>): Promise<InfoblockEntity | null>;
    abstract findById(id: number): Promise<RqEntity | null>;
    // abstract findByCode(code: string): Promise<InfoblockEntity | null>;
    // abstract findByCodes(codes: string[]): Promise<InfoblockEntity[] | null>;
    // abstract findMany(): Promise<InfoblockEntity[] | null>;
}