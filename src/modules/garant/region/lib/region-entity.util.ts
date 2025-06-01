import { PrismaService } from "src/core/prisma";
import { RegionEntity } from "../region.entity";

export function createRegionEntityFromPrisma(data: NonNullable<Awaited<ReturnType<PrismaService['regions']['findUnique']>>>): RegionEntity {
    const entity = new RegionEntity();
    entity.id = data.id.toString();
    entity.number = data.number;
    entity.title = data.title;
    entity.code = data.code;
    entity.infoblock = data.infoblock;
    entity.abs = Number(data.abs);
    entity.tax = Number(data.tax);
    entity.tax_abs = Number(data.tax_abs);
    entity.created_at = data.created_at || undefined;
    entity.updated_at = data.updated_at || undefined;
    return entity;
} 