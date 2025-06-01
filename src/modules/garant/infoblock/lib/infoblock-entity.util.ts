import { PrismaService } from "src/core/prisma";
import { InfoblockEntity } from "../infoblock.entity";

export function createInfoblockEntityFromPrisma(data: NonNullable<Awaited<ReturnType<PrismaService['infoblocks']['findUnique']>>>): InfoblockEntity {
    const entity = new InfoblockEntity();
    entity.id = data.id.toString();
    entity.number = data.number;
    entity.name = data.name;
    entity.title = data.title;
    entity.description = data.description;
    entity.descriptionForSale = data.descriptionForSale;
    entity.shortDescription = data.shortDescription;
    entity.weight = data.weight;
    entity.code = data.code;
    entity.inGroupId = data.inGroupId?.toString() ?? null;
    entity.groupId = (data.groupId || BigInt(0)).toString();
    entity.isLa = data.isLa;
    entity.isFree = data.isFree;
    entity.isShowing = data.isShowing;
    entity.isSet = data.isSet;
    entity.isProduct = data.isProduct;
    entity.isPackage = data.isPackage;
    entity.tag = data.tag;
    entity.parent_id = data.parent_id?.toString() ?? null;
    entity.relation_id = data.relation_id?.toString() ?? null;
    entity.related_id = data.related_id?.toString() ?? null;
    entity.excluded_id = data.excluded_id?.toString() ?? null;
    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;
    return entity;
}