import { RegionEntity } from "./region.entity";

export abstract class RegionRepository {
    abstract create(region: Partial<RegionEntity>): Promise<RegionEntity | null>;
    abstract update(region: Partial<RegionEntity>): Promise<RegionEntity | null>;
    abstract findById(id: string): Promise<RegionEntity | null>;
    abstract findMany(): Promise<RegionEntity[] | null>;
    abstract findByCode(code: string): Promise<RegionEntity | null>;
    abstract findByCodes(codes: string[]): Promise<RegionEntity[] | null>;
} 