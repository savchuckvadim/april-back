import { RegionService } from '@lib/garant';
import { Injectable, NotFoundException } from '@nestjs/common';
import { GetPortalRegionResponseDto } from '../dto/request/get-portal-region-response.dto';
import { Prisma } from 'generated/prisma';
import { CreatePortalRegionDtoAdminRequest } from '../dto/request/create-portal-region-request.dto';
import { UpdatePortalRegionDtoAdmin } from '../dto/request/update-portal-region-request.dto';
import {
    BulkSetPortalRegionsDto,
    BulkSetPortalRegionsResultDto,
} from '../dto/request/bulk-set-portal-regions.dto';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';

/** НДС-множитель own_tax — тот же, что в updatePortalRegion */
const OWN_TAX = '1.20';

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
            ? new Prisma.Decimal(dto.own_abs)
            : new Prisma.Decimal('0.00');
        const own_tax = dto.own_abs
            ? new Prisma.Decimal('1.20')
            : new Prisma.Decimal('0.00');
        const own_tax_absRaw = Number(dto.own_abs) * Number(own_tax);
        const own_tax_abs = dto.own_abs
            ? new Prisma.Decimal(own_tax_absRaw.toFixed(2))
            : new Prisma.Decimal('0.00');

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

    /**
     * Массовое применение чекбоксов регионов портала: enabled=true создаёт
     * связь (идемпотентно) и, если передан ownAbs, ставит собственный рабс
     * (own_tax 1.20, own_tax_abs считается); ownAbs=null сбрасывает own к
     * общему рабсу; enabled=false удаляет связь. Невключённый регион при
     * выключении — не ошибка, просто пропуск без причины в отчёте.
     */
    async bulkSetPortalRegions(
        dto: BulkSetPortalRegionsDto,
    ): Promise<BulkSetPortalRegionsResultDto> {
        const result: BulkSetPortalRegionsResultDto = {
            enabled: 0,
            disabled: 0,
            updatedOwn: 0,
            skipped: [],
        };
        const current =
            (await this.regionService.findByPortalId(dto.portalId)) ?? [];
        const enabledIds = new Set(current.map(region => Number(region.id)));

        for (const item of dto.items) {
            if (!item.enabled) {
                if (!enabledIds.has(item.regionId)) continue; // уже выключен
                const deleted = await this.regionService.deletePortalRegion(
                    dto.portalId,
                    item.regionId,
                );
                if (deleted) {
                    result.disabled += 1;
                } else {
                    result.skipped.push({
                        regionId: item.regionId,
                        reason: 'не удалось выключить регион',
                    });
                }
                continue;
            }

            if (!enabledIds.has(item.regionId)) {
                const created = await this.regionService.createPortalRegion(
                    dto.portalId,
                    item.regionId,
                );
                if (!created) {
                    result.skipped.push({
                        regionId: item.regionId,
                        reason: 'не удалось включить регион',
                    });
                    continue;
                }
                result.enabled += 1;
            }

            if (item.ownAbs !== undefined) {
                const updated = await this.applyOwnAbs(
                    dto.portalId,
                    item.regionId,
                    item.ownAbs,
                );
                if (updated) {
                    result.updatedOwn += 1;
                } else {
                    result.skipped.push({
                        regionId: item.regionId,
                        reason: 'не удалось обновить собственный рабс',
                    });
                }
            }
        }
        return result;
    }

    /** Установка/сброс own-полей связи портал-регион */
    private async applyOwnAbs(
        portalId: number,
        regionId: number,
        ownAbs: string | null,
    ): Promise<boolean> {
        const zero = new Prisma.Decimal('0.00');
        const abs = ownAbs ? new Prisma.Decimal(ownAbs) : zero;
        const tax = ownAbs ? new Prisma.Decimal(OWN_TAX) : zero;
        const taxAbs = ownAbs
            ? new Prisma.Decimal((Number(ownAbs) * Number(OWN_TAX)).toFixed(2))
            : zero;
        const updated = await this.regionService.updatePortalRegion(
            portalId,
            regionId,
            abs,
            tax,
            taxAbs,
        );
        return updated !== null;
    }

    // private prepareWithCheckedStatus(portalRegions: RegionEntity[], allRegions: RegionEntity[]) {
    //     return allRegions.map(region => {
    //         const portalRegion = portalRegions && portalRegions.find(portalRegion => portalRegion.id === region.id);
    //         const serarchedRegion = portalRegion || region;
    //         return new GetPortalRegionResponseDto(serarchedRegion, !!portalRegion);
    //     });
    // }
}
