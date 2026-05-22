import { RegionService } from '@/modules/garant';
import { Injectable, NotFoundException } from '@nestjs/common';
import { GetPortalRegionResponseDto } from '../dto/request/get-portal-region-response.dto';
import { Decimal } from 'generated/prisma/runtime/library';
import { CreatePortalRegionDtoAdminRequest } from '../dto/request/create-portal-region-request.dto';
import { UpdatePortalRegionDtoAdmin } from '../dto/request/update-portal-region-request.dto';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';

@Injectable()
export class PortalRegionService {
    constructor(
        private readonly regionService: RegionService,
        private readonly portalService: PortalStoreService,
    ) {}

    async getPortalRegions(portalId: number) {
        //этот метод в поля региона
        // tax_abs
        // tax
        // abs
        // подставляет значения из pivot связи portal_region если они не пусты
        const portalRegions = await this.regionService.findByPortalId(portalId);

        const allRegions = await this.regionService.findAll();
        if (!allRegions) {
            throw new NotFoundException(
                'Regions not found! Something wrong with the database!',
            );
        }
        const resultRegions = allRegions.map(region => {
            const portalRegion =
                portalRegions &&
                portalRegions.find(
                    portalRegion => portalRegion.id === region.id,
                );
            const serarchedRegion = portalRegion || region;
            const isChecked = !!portalRegion;

            return new GetPortalRegionResponseDto(serarchedRegion, isChecked);
        });
        return resultRegions;
    }
    async createPortalRegion(dto: CreatePortalRegionDtoAdminRequest) {
        return await this.regionService.createPortalRegion(
            dto.portalId,
            dto.regionId,
        );
    }
    async getPortalRegionUpdateInitialData(
        portalId: number,
        regionId: number,
    ): Promise<UpdatePortalRegionDtoAdmin | null> {
        const portal = await this.portalService.getPortal(portalId);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const region =
            await this.regionService.getPortalRegionUpdateInitialData(
                portalId,
                regionId,
            );
        if (!region) {
            throw new NotFoundException('Region not found');
        }
        return {
            domain: portal.domain || '',
            regionCode: region.regionCode || '',
            own_abs: region.own_abs.toString(),
            own_tax: region.own_tax.toString(),
            own_tax_abs: region.own_tax_abs.toString(),
        };
    }
    async updatePortalRegion(
        portalId: number,
        regionId: number,
        dto: UpdatePortalRegionDtoAdmin,
    ) {
        const own_abs = dto.own_abs
            ? new Decimal(dto.own_abs)
            : new Decimal('0.00');
        const own_tax = dto.own_abs ? new Decimal('1.20') : new Decimal('0.00');
        const own_tax_absRaw = Number(dto.own_abs) * Number(own_tax);
        const own_tax_abs = dto.own_abs
            ? new Decimal(own_tax_absRaw.toFixed(2))
            : new Decimal('0.00');

        return await this.regionService.updatePortalRegion(
            portalId,
            regionId,
            own_abs,
            own_tax,
            own_tax_abs,
        );
    }
    async deletePortalRegion(portalId: number, regionId: number) {
        return await this.regionService.deletePortalRegion(portalId, regionId);
    }

    // private prepareWithCheckedStatus(portalRegions: RegionEntity[], allRegions: RegionEntity[]) {
    //     return allRegions.map(region => {
    //         const portalRegion = portalRegions && portalRegions.find(portalRegion => portalRegion.id === region.id);
    //         const serarchedRegion = portalRegion || region;
    //         return new GetPortalRegionResponseDto(serarchedRegion, !!portalRegion);
    //     });
    // }
}
