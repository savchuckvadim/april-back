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

// этот класс для связи между порталом и регионом
export class PortalRegionEntity {
    portalId: number;
    regionId: number;
    own_abs: number;
    own_tax: number;
    own_tax_abs: number;
    regionCode: string;
    created_at?: Date;
    updated_at?: Date;
}
