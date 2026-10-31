import { Injectable, NotFoundException } from '@nestjs/common';
import { RegionRepository } from '../region.repository';
import { PortalRegionOwnPatch, RegionEntity } from '../region.entity';

import {
    CreatePortalRegionDto,
    DeletePortalRegionDto,
    UpdatePortalRegionDto,
} from './dto/portal-region.dto';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';

@Injectable()
export class PortalRegionService {
    constructor(
        private readonly repo: RegionRepository,
        private readonly portalService: PortalStoreService,
    ) {}

    async getPortalRegions(domain: string): Promise<RegionEntity[] | null> {
        const portalId = await this.getPortalId(domain);
        return await this.repo.findByPortalId(portalId);
    }

    async createPortalRegion(
        dto: CreatePortalRegionDto,
    ): Promise<RegionEntity | null> {
        const portalId = await this.getPortalId(dto.domain);
        const regionId = await this.getRegionId(dto.regionCode);
        return await this.repo.createPortalRegion(portalId, regionId);
    }

    /**
     * Ручные own-цены по domain и коду региона. Ручная цена и
     * регион-источник взаимоисключающие, поэтому ссылка сбрасывается.
     */
    async updatePortalRegion(
        dto: UpdatePortalRegionDto,
    ): Promise<RegionEntity | null> {
        const portalId = await this.getPortalId(dto.domain);
        const regionId = await this.getRegionId(dto.regionCode);

        const patch: PortalRegionOwnPatch = {
            own_abs: dto.own_abs ?? null,
            own_tax: dto.own_tax ?? null,
            own_tax_abs: dto.own_tax_abs ?? null,
            own_abs_region_id: null,
        };
        return await this.repo.updatePortalRegion(portalId, regionId, patch);
    }

    async deletePortalRegion(dto: DeletePortalRegionDto): Promise<boolean> {
        return await this.repo.deletePortalRegion(dto.portalId, dto.regionId);
    }

    private async getPortalId(domain: string): Promise<number> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        return Number(portal.id);
    }
    private async getRegionId(regionCode: string): Promise<number> {
        const region = await this.repo.findByCode(regionCode);
        if (!region) {
            throw new NotFoundException('Region not found');
        }
        return Number(region.id);
    }
}
