import { PrismaService } from "src/core/prisma";
import { InfoblockEntity, InfoblockLightEntity } from "../infoblock.entity";

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
    entity.group_id = (data.group_id || BigInt(0)).toString();
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

export const getLightFromEntity = (entity: InfoblockEntity): InfoblockLightEntity => {
    const light = new InfoblockLightEntity();
    light.id = entity.id;
    light.number = entity.number;
    light.name = entity.name;
    light.title = entity.title;
    light.weight = entity.weight;
    light.code = entity.code;
    light.group_id = entity.group_id;
    light.isLa = entity.isLa;
    light.isFree = entity.isFree;
    light.isShowing = entity.isShowing;
    light.isSet = entity.isSet;
    light.isProduct = entity.isProduct;
    light.isPackage = entity.isPackage;
    light.tag = entity.tag;
    light.group = entity.group?.code ?? null;
    return light;
}