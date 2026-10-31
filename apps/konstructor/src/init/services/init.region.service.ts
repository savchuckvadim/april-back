import { Injectable } from '@nestjs/common';
import { RegionEntity, RegionService } from '@lib/garant';

export type IInitRegion = RegionEntity & {
    /** Привязан к порталу (portal_region): по умолчанию выбор идёт из таких */
    inPortal: boolean;
};

/**
 * Регионы для init (решение владельца 3): весь справочник, привязанные к
 * порталу (portal_region) — с признаком inPortal и его own_abs/own_tax/own_tax_abs
 * поверх общих ставок. Менеджер выбирает из портальных, но может открыть
 * полный список; у портала без привязок inPortal = false у всех.
 */
@Injectable()
export class InitRegionService {
    constructor(private readonly regionService: RegionService) {}

    async get(portalId: number): Promise<IInitRegion[]> {
        const [all, portalRegions] = await Promise.all([
            this.regionService.findAll(),
            this.regionService.findByPortalId(portalId),
        ]);
        const own = new Map(
            (portalRegions ?? []).map(region => [region.code, region]),
        );
        return (all ?? []).map(region => {
            const portalRegion = own.get(region.code);
            return portalRegion
                ? { ...portalRegion, inPortal: true }
                : { ...region, inPortal: false };
        });
    }
}
