import { Injectable } from '@nestjs/common';
import { PriceRepository } from '../repositories/price.repository';
import { PriceEntity } from '../entity/price.entity';
import { PriceCreateType } from '../types/price-from-excel.type';
import { ComplectExcelService } from './complect-prices/complect-excel-service';
import { ServicesPriceService } from './packages-prices/services-price.service';

@Injectable()
export class PriceService {
    constructor(
        private readonly repo: PriceRepository,
        private readonly complectExcelService: ComplectExcelService,
        private readonly servicesPriceService: ServicesPriceService,
    ) {}

    async getAll() {
        return await this.repo.findMany();
    }

    async create(price: PriceCreateType): Promise<PriceEntity> {
        return await this.repo.create(price);
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

    async updateFromExcel(): Promise<PriceEntity[] | null> {
        // Читаем данные из Excel
        const prices = await this.complectExcelService.updateFromExcel();
        const servicesPrices =
            await this.servicesPriceService.updateFromExcel();

        return [...prices, ...servicesPrices];
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
