export class RegionEntity {
    id: string;
    number: number;
    title: string;
    code: string;
    infoblock: string;
    abs: number;
    tax: number;
    tax_abs: number;
    created_at?: Date;
    updated_at?: Date;
}

/**
 * Своя цена портала на регион (связь portal_region) для формы правки:
 * ручной рабс либо регион-источник, чей рабс портал берёт за свой.
 */
export class PortalRegionEntity {
    portalId: number;
    regionId: number;
    own_abs: number;
    own_tax: number;
    own_tax_abs: number;
    /** Регион-источник рабса; null — не задан */
    own_abs_region_id: number | null;
    own_abs_region_code: string | null;
    regionCode: string;
    created_at?: Date;
    updated_at?: Date;
}

/** Связь портал→регион вместе с регионом-источником, если он задан */
export interface PortalRegionLink {
    portalId: number;
    regionId: number;
    /** Ручной рабс; null или 0 — не задан */
    ownAbs: number | null;
    ownTax: number | null;
    ownTaxAbs: number | null;
    /** Регион, чей рабс берётся за свой; null — не задан */
    ownAbsRegion: RegionEntity | null;
}

/**
 * Правка own-полей связи портал→регион.
 * Ключ не передан — поле не трогаем, null — сбрасываем.
 * Decimal-поля передаются строкой («4177.20»), чтобы не терять копейки.
 */
export interface PortalRegionOwnPatch {
    own_abs?: string | null;
    own_tax?: string | null;
    own_tax_abs?: string | null;
    own_abs_region_id?: number | null;
}
