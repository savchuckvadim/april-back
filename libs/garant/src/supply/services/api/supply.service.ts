import { Injectable } from '@nestjs/common';
import { SupplyEntity } from '../../supply.entity';
import { SupplyRepository } from '../../supply.repository';
import { SupplyExcelService } from '../supply-excel.service';

@Injectable()
export class SupplyService {
    constructor(
        private readonly supplyRepository: SupplyRepository,
        private readonly supplyExcelService: SupplyExcelService,
    ) {}

    async create(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        return this.supplyRepository.create(supply);
    }

    async update(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        return this.supplyRepository.update(supply);
    }

    async findById(id: string): Promise<SupplyEntity | null> {
        return this.supplyRepository.findById(id);
    }

    async findByCode(code: string): Promise<SupplyEntity | null> {
        return this.supplyRepository.findByCode(code);
    }

    async findMany(): Promise<SupplyEntity[] | null> {
        return this.supplyRepository.findMany();
    }

    async findAll(): Promise<SupplyEntity[] | null> {
        return this.supplyRepository.findMany();
    }

    async updateFromExcel(): Promise<SupplyEntity[] | null> {
        // Читаем данные из Excel
        const supplies = await this.supplyExcelService.readSuppliesFromExcel();
        if (!supplies) {
            throw new Error('Failed to read supplies from Excel file');
        }

        // Обновляем или создаем поставки
        const updatedSupplies: SupplyEntity[] = [];

        for (const supply of supplies) {
            if (!supply.code) {
                continue;
            }

            // Ищем существующую поставку по code
            const existingSupply = await this.findByCode(supply.code);

            if (existingSupply) {
                // Обновляем существующую поставку
                const updated = await this.update({
                    id: existingSupply.id,
                    ...supply,
                });
                if (updated) {
                    updatedSupplies.push(updated);
                }
            } else {
                // Создаем новую поставку
                const created = await this.create(supply);
                if (created) {
                    updatedSupplies.push(created);
                }
            }
        }

        return updatedSupplies;
    }
}
