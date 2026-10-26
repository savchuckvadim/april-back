import { Injectable } from '@nestjs/common';
import { RegionRepository } from './region.repository';
import { PortalRegionEntity, RegionEntity } from './region.entity';
import { Prisma } from 'generated/prisma';

@Injectable()
export class RegionService {
    constructor(private readonly regionRepository: RegionRepository) {}

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
        own_abs: Prisma.Decimal,
        own_tax: Prisma.Decimal,
        own_tax_abs: Prisma.Decimal,
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
