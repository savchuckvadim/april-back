import { Injectable } from '@nestjs/common';
import {
    RabsVatService,
    RegionEntity,
    RegionService,
    withRabsVat,
} from '@lib/garant';

export type IInitRegion = RegionEntity & {
    /** Привязан к порталу (portal_region): по умолчанию выбор идёт из таких */
    inPortal: boolean;
};

/**
 * Регионы для init (решение владельца 3): весь справочник, привязанные к
 * порталу (portal_region) — с признаком inPortal и его own_abs (или рабсом
 * региона-источника) поверх общего рабса. Менеджер выбирает из портальных, но
 * может открыть полный список; у портала без привязок inPortal = false у всех.
 *
 * Рабс (abs) отдаётся без НДС. НДС считается на лету после слияния рабса
 * портала: tax равен коэффициенту из настроек вендора, tax_abs равен
 * действующему рабсу, умноженному на него. Хранимые tax / tax_abs /
 * own_tax / own_tax_abs не используются: правка коэффициента в админке
 * действует сразу, без пересчёта таблиц.
 */
@Injectable()
export class InitRegionService {
    constructor(
        private readonly regionService: RegionService,
        private readonly rabsVat: RabsVatService,
    ) {}

    async get(portalId: number): Promise<IInitRegion[]> {
        const [all, portalRegions, vat] = await Promise.all([
            this.regionService.findAll(),
            this.regionService.findByPortalId(portalId),
            this.rabsVat.coefficient(),
        ]);
        const own = new Map(
            (portalRegions ?? []).map(region => [region.code, region]),
        );
        return (all ?? []).map(region => {
            const portalRegion = own.get(region.code);
            return withRabsVat(
                portalRegion
                    ? { ...portalRegion, inPortal: true }
                    : { ...region, inPortal: false },
                vat,
            );
        });
    }
}
