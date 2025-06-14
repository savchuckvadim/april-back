import { Decimal } from "@prisma/client/runtime/library";
import { RegionEntity } from "./region.entity";

export abstract class RegionRepository {
    abstract create(region: Partial<RegionEntity>): Promise<RegionEntity | null>;
    abstract update(region: Partial<RegionEntity>): Promise<RegionEntity | null>;
    abstract findById(id: string): Promise<RegionEntity | null>;
    abstract findMany(): Promise<RegionEntity[] | null>;
    abstract findByCode(code: string): Promise<RegionEntity | null>;
    abstract findByCodes(codes: string[]): Promise<RegionEntity[] | null>;
    abstract findByPortalId(portalId: number): Promise<RegionEntity[] | null>;
    abstract createPortalRegion(portalId: number, regionId: number): Promise<RegionEntity[] | null>;
    abstract updatePortalRegion(
        portalId: number,
        regionId: number,
        own_abs: Decimal | null,
        own_tax: Decimal | null,
        own_tax_abs: Decimal | null
    ): Promise<RegionEntity[] | null>;
    abstract deletePortalRegion(portalId: number, regionId: number): Promise<RegionEntity[] | null>;
} 