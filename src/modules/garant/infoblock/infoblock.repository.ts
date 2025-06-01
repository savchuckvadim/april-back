import { InfoblockEntity } from "./infoblock.entity";


export abstract class InfoblockRepository {
    // abstract create(infoblock: Partial<InfoblockEntity>): Promise<InfoblockEntity | null>;
    abstract findById(id: number): Promise<InfoblockEntity | null>;
    abstract findByCode(code: string): Promise<InfoblockEntity | null>;
    abstract findByCodes(codes: string[]): Promise<InfoblockEntity[] | null>;
    abstract findMany(): Promise<InfoblockEntity[] | null>;
}