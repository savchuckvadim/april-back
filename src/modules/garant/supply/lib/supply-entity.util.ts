import { PrismaService } from "src/core/prisma";
import { SupplyEntity } from "../supply.entity";

export function createSupplyEntityFromPrisma(data: NonNullable<Awaited<ReturnType<PrismaService['supplies']['findUnique']>>>): SupplyEntity {
    const entity = new SupplyEntity();
    entity.id = data.id;
    entity.name = data.name;
    entity.fullName = data.fullName;
    entity.shortName = data.shortName;
    entity.saleName_1 = data.saleName_1;
    entity.saleName_2 = data.saleName_2;
    entity.saleName_3 = data.saleName_3;
    entity.usersQuantity = data.usersQuantity;
    entity.description = data.description;
    entity.code = data.code;
    entity.type = data.type;
    entity.color = data.color;
    entity.coefficient = data.coefficient;
    entity.contractName = data.contractName;
    entity.contractPropComment = data.contractPropComment;
    entity.contractPropEmail = data.contractPropEmail;
    entity.contractPropLoginsQuantity = data.contractPropLoginsQuantity;
    entity.lcontractName = data.lcontractName;
    entity.lcontractPropComment = data.lcontractPropComment;
    entity.lcontractPropEmail = data.lcontractPropEmail;
    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;
    return entity;
} 