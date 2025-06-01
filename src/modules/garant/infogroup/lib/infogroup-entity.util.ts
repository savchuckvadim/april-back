import { PrismaService } from "src/core/prisma";
import { InfogroupEntity } from "../infogroup.entity";


export function createInfogroupEntityFromPrisma(data: NonNullable<Awaited<ReturnType<PrismaService['info_groups']['findUnique']>>>): InfogroupEntity {
    const entity = new InfogroupEntity();
    entity.id = data.id.toString();
    entity.number = data.number;
    entity.name = data.name;
    entity.title = data.title;
    entity.description = data.description;
    entity.descriptionForSale = data.descriptionForSale;
    entity.shortDescription = data.shortDescription;
    entity.code = data.code;
    entity.type = data.type;
    entity.productType = data.productType;
    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;
    return entity;
}