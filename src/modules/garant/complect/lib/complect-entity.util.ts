import { PrismaService } from "src/core/prisma";
import { ComplectEntity } from "../complect.entity";

export function createComplectEntityFromPrisma(
    data: NonNullable<Awaited<ReturnType<PrismaService['complects']['findUnique']>>>
): ComplectEntity {
    const entity = new ComplectEntity();
    entity.id = data.id.toString();
    entity.name = data.name;
    entity.fullName = data.fullName;
    entity.shortName = data.shortName;
    entity.description = data.description ?? undefined;
    entity.code = data.code;
    entity.type = data.type;
    entity.color = data.color;
    entity.weight = data.weight;
    entity.abs = data.abs?.toString() ?? undefined;
    entity.number = data.number;
    entity.productType = data.productType;
    entity.withABS = data.withABS;
    entity.withConsalting = data.withConsalting;
    entity.withServices = data.withServices;
    entity.withLt = data.withLt;
    entity.isChanging = data.isChanging;
    entity.withDefault = data.withDefault;
    entity.created_at = data.created_at ?? undefined;
    entity.updated_at = data.updated_at ?? undefined;
    return entity;
}
