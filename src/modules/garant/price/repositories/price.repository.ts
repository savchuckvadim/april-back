import { PriceEntity } from '../entity/price.entity';
import { PriceCreateType } from '../types/price-from-excel.type';

export abstract class PriceRepository {
    abstract storeByComplect(price: PriceCreateType): Promise<PriceEntity>;
    abstract storeByPackage(price: PriceCreateType): Promise<PriceEntity>;

    abstract create(price: PriceCreateType): Promise<PriceEntity>;

    abstract update(id: bigint, price: PriceCreateType): Promise<PriceEntity>;

    abstract findById(id: number): Promise<PriceEntity>;

    abstract findByUniqueFromComplect(
        complect_code: string,
        supply_code: string,
        region_type: '1' | '0',
    ): Promise<PriceEntity | null>;

    abstract findByUniqueFromGarantPackage(
        garant_package_code: string,
        region_type: '1' | '0',
    ): Promise<PriceEntity | null>;

    // abstract findByCode(code: string): Promise<PriceEntity | null>;
    // abstract findByCodes(codes: string[]): Promise<PriceEntity[] | null>;
    abstract findMany(): Promise<PriceEntity[]>;
    abstract delete(id: number): Promise<boolean>;

    abstract deleteMany(ids: number[]): Promise<boolean>;
    abstract deleteAll(): Promise<boolean>;
}
