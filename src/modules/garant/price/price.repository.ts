import { PriceEntity } from "./price.entity";


export abstract class PriceRepository {
    abstract create(infoblock: Partial<PriceEntity>): Promise<PriceEntity | null>;
    abstract update(infoblock: Partial<PriceEntity>): Promise<PriceEntity | null>;

    abstract findById(id: number): Promise<PriceEntity | null>;
   
    // abstract findByCode(code: string): Promise<PriceEntity | null>;
    // abstract findByCodes(codes: string[]): Promise<PriceEntity[] | null>;
    abstract findMany(): Promise<PriceEntity[] | null>;
}