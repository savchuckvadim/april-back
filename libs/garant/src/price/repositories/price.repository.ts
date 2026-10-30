import { PriceEntity } from '../entity/price.entity';
import { PriceCreateType } from '../types/price-from-excel.type';

/** Итог пакетной записи цен: сколько создано, обновлено и не изменилось */
export interface PriceStoreManyResult {
    created: number;
    updated: number;
    unchanged: number;
    /** Ключи, которые записать не удалось, с причиной */
    failed: Array<{ key: string; reason: string }>;
}

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

    /**
     * Запись пачки цен одной транзакцией: либо лягут все, либо ни одна.
     * Нужна для загрузки книги цен — поштучная запись это ~4 запроса на
     * цену (поиск комплекта, поставки, существующей цены, сама запись),
     * то есть под две тысячи запросов подряд на полный прайс.
     */
    abstract storeManyByComplect(
        prices: PriceCreateType[],
    ): Promise<PriceStoreManyResult>;

    // abstract findByCode(code: string): Promise<PriceEntity | null>;
    // abstract findByCodes(codes: string[]): Promise<PriceEntity[] | null>;
    abstract findMany(): Promise<PriceEntity[]>;
    abstract delete(id: number): Promise<boolean>;

    abstract deleteMany(ids: number[]): Promise<boolean>;
    abstract deleteAll(): Promise<boolean>;
}
