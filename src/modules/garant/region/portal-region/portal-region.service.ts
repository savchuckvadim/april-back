import { Injectable, NotFoundException } from '@nestjs/common';
import { RegionRepository } from '../region.repository';
import { RegionEntity } from '../region.entity';
import { Decimal } from 'generated/prisma/runtime/library';

import {
    CreatePortalRegionDto,
    DeletePortalRegionDto,
    UpdatePortalRegionDto,
} from './dto/portal-region.dto';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';

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

    async updatePortalRegion(
        dto: UpdatePortalRegionDto,
    ): Promise<RegionEntity | null> {
        const portalId = await this.getPortalId(dto.domain);
        const regionId = await this.getRegionId(dto.regionCode);

        // Конвертируем строки в Decimal (Prisma может принимать строки, но лучше явно создать Decimal)
        const own_abs = dto.own_abs ? new Decimal(dto.own_abs) : null;
        const own_tax = dto.own_tax ? new Decimal(dto.own_tax) : null;
        const own_tax_abs = dto.own_tax_abs
            ? new Decimal(dto.own_tax_abs)
            : null;

        return await this.repo.updatePortalRegion(
            portalId,
            regionId,
            own_abs,
            own_tax,
            own_tax_abs,
        );
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
