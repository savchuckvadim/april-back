import { RabsVatService, RegionService, roundToCents } from '@lib/garant';
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { GetPortalRegionResponseDto } from '../dto/request/get-portal-region-response.dto';
import { CreatePortalRegionDtoAdminRequest } from '../dto/request/create-portal-region-request.dto';
import { UpdatePortalRegionDtoAdmin } from '../dto/request/update-portal-region-request.dto';
import {
    BulkPortalRegionItemDto,
    BulkSetPortalRegionsDto,
    BulkSetPortalRegionsResultDto,
} from '../dto/request/bulk-set-portal-regions.dto';
import { buildOwnPricePatch } from '../lib/own-price-patch.util';

@Injectable()
export class PortalRegionService {
    constructor(
        private readonly regionService: RegionService,
        private readonly portalService: PortalStoreService,
        private readonly rabsVat: RabsVatService,
    ) {}

    /** Весь справочник регионов с признаком привязки и своей ценой портала */
    async getPortalRegions(
        portalId: number,
    ): Promise<GetPortalRegionResponseDto[]> {
        const [allRegions, links, vat] = await Promise.all([
            this.regionService.findAll(),
            this.regionService.findPortalRegionLinks(Number(portalId)),
            this.rabsVat.coefficient(),
        ]);
        if (!allRegions) {
            throw new NotFoundException(
                'Regions not found! Something wrong with the database!',
            );
        }
        const byRegion = new Map(links.map(link => [link.regionId, link]));
        return allRegions.map(
            region =>
                new GetPortalRegionResponseDto(
                    region,
                    byRegion.get(Number(region.id)) ?? null,
                    vat,
                ),
        );
    }

    async createPortalRegion(
        dto: CreatePortalRegionDtoAdminRequest,
    ): Promise<GetPortalRegionResponseDto | null> {
        const created = await this.regionService.createPortalRegion(
            dto.portalId,
            dto.regionId,
        );
        if (!created) return null;
        return this.viewOne(dto.portalId, dto.regionId);
    }

    /**
     * Данные формы региона портала. Ручной рабс показывается вместе с НДС,
     * посчитанным на лету от коэффициента из настроек вендора: записанные
     * в базе own_tax / own_tax_abs могли остаться от прежнего коэффициента.
     */
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
                Number(portalId),
                Number(regionId),
            );
        if (!region) {
            throw new NotFoundException('Region not found');
        }
        // Ноль в own-полях значит «не задано»: форма показывает пустое поле
        const ownAbs = region.own_abs > 0 ? region.own_abs : null;
        const vat = await this.rabsVat.coefficient();
        return {
            domain: portal.domain || '',
            regionCode: region.regionCode || '',
            own_abs: ownAbs === null ? null : ownAbs.toString(),
            own_tax: ownAbs === null ? null : vat.toString(),
            own_tax_abs:
                ownAbs === null ? null : roundToCents(ownAbs * vat).toString(),
            own_abs_region_id: region.own_abs_region_id,
        };
    }

    /** Форма одного региона: ручной рабс или регион-источник */
    async updatePortalRegion(
        portalId: number,
        regionId: number,
        dto: UpdatePortalRegionDtoAdmin,
    ): Promise<GetPortalRegionResponseDto | null> {
        const vat = await this.rabsVat.coefficient();
        const built = buildOwnPricePatch(
            Number(regionId),
            {
                ownAbs: dto.own_abs ?? null,
                ownAbsRegionId: dto.own_abs_region_id ?? null,
            },
            await this.knownRegionIds(),
            vat,
        );
        if (!built.ok) {
            throw new BadRequestException(built.reason);
        }
        const updated = await this.regionService.updatePortalRegion(
            Number(portalId),
            Number(regionId),
            built.patch,
        );
        if (!updated) return null;
        return this.viewOne(Number(portalId), Number(regionId), vat);
    }

    async deletePortalRegion(portalId: number, regionId: number) {
        return await this.regionService.deletePortalRegion(
            Number(portalId),
            Number(regionId),
        );
    }

    /**
     * Массовое применение чекбоксов регионов портала: enabled=true создаёт
     * связь (идемпотентно), enabled=false удаляет. Своя цена правится,
     * только если передан ownAbs или ownAbsRegionId: число — ручной рабс
     * (own_tax — коэффициент НДС рабса из настроек вендора, own_tax_abs
     * считается от него), id — регион-источник,
     * null — сброс к общему рабсу. Невключённый регион при выключении —
     * тихий пропуск, ошибки строк попадают в skipped и не ломают остальные.
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
        const [links, knownIds, vat] = await Promise.all([
            this.regionService.findPortalRegionLinks(dto.portalId),
            this.knownRegionIds(),
            this.rabsVat.coefficient(),
        ]);
        const enabledIds = new Set(links.map(link => link.regionId));

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

            if (!this.hasOwnChange(item)) continue;
            const built = buildOwnPricePatch(
                item.regionId,
                {
                    ownAbs: item.ownAbs ?? null,
                    ownAbsRegionId: item.ownAbsRegionId ?? null,
                },
                knownIds,
                vat,
            );
            if (!built.ok) {
                result.skipped.push({
                    regionId: item.regionId,
                    reason: built.reason,
                });
                continue;
            }
            const updated = await this.regionService.updatePortalRegion(
                dto.portalId,
                item.regionId,
                built.patch,
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
        return result;
    }

    /** Свою цену трогаем, только когда её явно прислали */
    private hasOwnChange(item: BulkPortalRegionItemDto): boolean {
        return item.ownAbs !== undefined || item.ownAbsRegionId !== undefined;
    }

    private async knownRegionIds(): Promise<Set<number>> {
        const all = (await this.regionService.findAll()) ?? [];
        return new Set(all.map(region => Number(region.id)));
    }

    /** Регион с текущей связью портала в формате списка */
    private async viewOne(
        portalId: number,
        regionId: number,
        knownVat?: number,
    ): Promise<GetPortalRegionResponseDto | null> {
        const [region, links, vat] = await Promise.all([
            this.regionService.findById(String(regionId)),
            this.regionService.findPortalRegionLinks(portalId),
            knownVat ?? this.rabsVat.coefficient(),
        ]);
        if (!region) return null;
        const link = links.find(row => row.regionId === regionId) ?? null;
        return new GetPortalRegionResponseDto(region, link, vat);
    }
}
