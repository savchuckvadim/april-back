import { Injectable } from '@nestjs/common';
import { RegionRepository } from './region.repository';
import {
    PortalRegionEntity,
    PortalRegionLink,
    PortalRegionOwnPatch,
    RegionEntity,
} from './region.entity';

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

    /** Регионы портала с действующей для него ценой (источник → ручной → общий) */
    async findByPortalId(portalId: number): Promise<RegionEntity[] | null> {
        return this.regionRepository.findByPortalId(portalId);
    }

    /** Связи портал→регион как есть: ручной рабс и регион-источник */
    async findPortalRegionLinks(portalId: number): Promise<PortalRegionLink[]> {
        return this.regionRepository.findPortalRegionLinks(portalId);
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

    /** Правка own-полей связи: ручной рабс или регион-источник */
    async updatePortalRegion(
        portalId: number,
        regionId: number,
        patch: PortalRegionOwnPatch,
    ): Promise<RegionEntity | null> {
        return this.regionRepository.updatePortalRegion(
            portalId,
            regionId,
            patch,
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
