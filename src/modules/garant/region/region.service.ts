import { Injectable } from '@nestjs/common';
import { RegionRepository } from './region.repository';
import { PortalRegionEntity, RegionEntity } from './region.entity';
import { RegionExcelService } from './services/region-excel.service';
import { Decimal } from 'generated/prisma/runtime/library';

@Injectable()
export class RegionService {
    constructor(
        private readonly regionRepository: RegionRepository,
        private readonly regionExcelService: RegionExcelService,
    ) {}

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
                    ...region,
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

    async delete(id: string): Promise<RegionEntity | null> {
        return this.regionRepository.delete(id);
    }

    async findByPortalId(portalId: number): Promise<RegionEntity[] | null> {
        return this.regionRepository.findByPortalId(portalId);
    }

    async createPortalRegion(
        portalId: number,
        regionId: number,
    ): Promise<RegionEntity | null> {
        // создать pivot связь между порталом и регионом
        return this.regionRepository.createPortalRegion(portalId, regionId);
    }

    async getPortalRegionUpdateInitialData(
        portalId: number,
        regionId: number,
    ): Promise<PortalRegionEntity | null> {
        return this.regionRepository.findByPortalIdPortalRegion(
            portalId,
            regionId,
        );
    }

    async updatePortalRegion(
        portalId: number,
        regionId: number,
        own_abs: Decimal,
        own_tax: Decimal,
        own_tax_abs: Decimal,
    ): Promise<RegionEntity | null> {
        // обновить поля связи pivot связь между порталом и регионом
        return this.regionRepository.updatePortalRegion(
            portalId,
            regionId,
            own_abs,
            own_tax,
            own_tax_abs,
        );
    }

    async deletePortalRegion(
        portalId: number,
        regionId: number,
    ): Promise<boolean> {
        // удалить pivot связь между порталом и регионом
        return this.regionRepository.deletePortalRegion(portalId, regionId);
    }
}
