import { Injectable } from '@nestjs/common';
import { RegionService } from '@lib/garant';

/**
 * Регионы для init (решение владельца 3): только привязанные к порталу
 * (portal_region) с его own_abs/own_tax/own_tax_abs поверх общих ставок.
 * Портал без привязок получает весь справочник — так работают порталы,
 * у которых регионы ещё не настроены в админке.
 */
@Injectable()
export class InitRegionService {
    constructor(private readonly regionService: RegionService) {}

    async get(portalId: number) {
        const portalRegions = await this.regionService.findByPortalId(portalId);
        if (portalRegions && portalRegions.length > 0) return portalRegions;
        return this.regionService.findAll();
    }
}
