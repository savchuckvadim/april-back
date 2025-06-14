import { Injectable } from "@nestjs/common";
import { RegionRepository } from "./region.repository";
import { RegionEntity } from "./region.entity";
import { RegionExcelService } from "./services/region-excel.service";



@Injectable()
export class RegionService {
    constructor(
        private readonly regionRepository: RegionRepository,
        private readonly regionExcelService: RegionExcelService,

    ) { }

    async create(region: Partial<RegionEntity>): Promise<RegionEntity | null> {
        return this.regionRepository.create(region);
    }

    async update(region: Partial<RegionEntity>): Promise<RegionEntity | null> {
        return this.regionRepository.update(region);
    }

    async findById(id: string): Promise<RegionEntity | null> {
        return this.regionRepository.findById(id);
    }

    async findAll(): Promise<RegionEntity[] | null> {
        return this.regionRepository.findMany();
    }

    async findByCode(code: string): Promise<RegionEntity | null> {
        return this.regionRepository.findByCode(code);
    }

    async findByCodes(codes: string[]): Promise<RegionEntity[] | null> {
        return this.regionRepository.findByCodes(codes);
    }

    async updateFromExcel(): Promise<RegionEntity[] | null> {
        // Читаем данные из Excel
        const regions = await this.regionExcelService.readRegionsFromExcel();
        if (!regions) {
            throw new Error('Failed to read regions from Excel file');
        }

        // Обновляем или создаем регионы
        const updatedRegions: RegionEntity[] = [];

        for (const region of regions) {
            const existingRegion = await this.findByCode(region.code!);

            if (existingRegion) {
                // Обновляем существующий регион
                const updated = await this.update({
                    id: existingRegion.id,
                    ...region
                });
                if (updated) {
                    updatedRegions.push(updated);
                }
            } else {
                // Создаем новый регион
                const created = await this.create(region);
                if (created) {
                    updatedRegions.push(created);
                }
            }
        }

        return updatedRegions;
    }
} 