import { Injectable } from '@nestjs/common';
import { PriceRepository } from '../repositories/price.repository';
import { PriceEntity } from '../entity/price.entity';
import { PriceCreateType } from '../types/price-from-excel.type';

/**
 * Цены каталога. Массовое обновление живёт в эталонных таблицах
 * (libs/garant/src/catalog-table) — здесь только доменные операции.
 */
@Injectable()
export class PriceService {
    constructor(private readonly repo: PriceRepository) {}

    async getAll() {
        return await this.repo.findMany();
    }

    async create(price: PriceCreateType): Promise<PriceEntity> {
        return await this.repo.create(price);
    }

    /** Upsert prof-цены по (complect_code, supply_code, region_type) */
    async storeByComplect(price: PriceCreateType): Promise<PriceEntity> {
        return await this.repo.storeByComplect(price);
    }

    /** Upsert цены пакета по (garant_package_code, region_type) */
    async storeByPackage(price: PriceCreateType): Promise<PriceEntity> {
        return await this.repo.storeByPackage(price);
    }

    /** Prof-цена по уникальному ключу (complect_code, supply_code, region_type) */
    async findByUnique(
        complectCode: string,
        supplyCode: string,
        regionType: '0' | '1',
    ): Promise<PriceEntity | null> {
        return await this.repo.findByUniqueFromComplect(
            complectCode,
            supplyCode,
            regionType,
        );
    }

    /** Цена пакета по уникальному ключу (garant_package_code, region_type) */
    async findPackagePrice(
        packageCode: string,
        regionType: '0' | '1',
    ): Promise<PriceEntity | null> {
        return await this.repo.findByUniqueFromGarantPackage(
            packageCode,
            regionType,
        );
    }

    async update(id: bigint, price: PriceCreateType): Promise<PriceEntity> {
        return await this.repo.update(id, price);
    }

    async findById(id: string): Promise<PriceEntity> {
        return await this.repo.findById(Number(id));
    }

    async findMany(): Promise<PriceEntity[]> {
        return await this.repo.findMany();
    }

    async findAll(): Promise<PriceEntity[]> {
        return await this.repo.findMany();
    }

    async deleteAll(): Promise<boolean> {
        return await this.repo.deleteAll();
    }

    async delete(id: number): Promise<boolean> {
        return await this.repo.delete(id);
    }

    async deleteMany(ids: number[]): Promise<boolean> {
        return await this.repo.deleteMany(ids);
    }
}
