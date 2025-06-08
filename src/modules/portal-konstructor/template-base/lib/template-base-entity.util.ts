import { createFieldLightEntityFromEntity } from "../../field";
import { TemplateBaseEntity, TemplateBaseLightEntity, TemplateBasePortalEntity } from "../template-base.entity";
import { PrismaService } from "src/core/prisma";

export function createTemplateBaseEntityFromPrisma(data: NonNullable<Awaited<ReturnType<PrismaService['templates']['findUnique']>>>): TemplateBaseEntity {
    const entity = new TemplateBaseEntity();
    entity.id = data.id.toString();
    entity.name = data.name;
    entity.code = data.code;
 
    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;


    return entity;
}

export function createTemplateBaseLightEntityFromEntity(entity: TemplateBaseEntity): TemplateBaseLightEntity {
    const light = new TemplateBaseLightEntity();
    light.id = entity.id;
    light.name = entity.name;
    light.code = entity.code;

    return light;
} 

export function createTemplateBasePortalEntityFromPrisma(
    data: NonNullable<Awaited<ReturnType<PrismaService['templates']['findUnique']>>>,
    fields: NonNullable<Awaited<ReturnType<PrismaService['fields']['findUnique']>>>[]

): TemplateBasePortalEntity {
    const entity = new TemplateBasePortalEntity();
    entity.id = data.id.toString();
    entity.name = data.name;
    entity.code = data.code;
 
    entity.fields = fields.map(field => ({
        id: field.id.toString(),
        number: field.number,
        name: field.name,
        code: field.code,
        type: field.type,
        isGeneral: field.isGeneral,
        isDefault: field.isDefault,
        isRequired: field.isRequired,
        value: field.value,
        description: field.description,
        bitixId: field.bitixId,
        bitrixTemplateId: field.bitrixTemplateId,
        isActive: field.isActive,
        isPlural: field.isPlural,
        
    }));

    return entity;
}