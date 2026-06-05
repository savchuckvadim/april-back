import type { Field as PrismaField } from 'generated/prisma';
import type { Prisma } from 'generated/prisma';
import { FieldEntity, FieldLightEntity } from '../field.entity';
import { createTemplateBaseEntityFromPrisma } from '../../template-base/lib/template-base-entity.util';

/** Field row from Prisma, optionally with `template_field.include.template` */
type FieldPrismaRow = PrismaField & {
    template_field?: Array<
        Prisma.TemplateFieldGetPayload<{
            include: { template: true };
        }>
    >;
};

export function createFieldEntityFromPrisma(data: FieldPrismaRow): FieldEntity {
    const entity = new FieldEntity();
    entity.id = data.id.toString();
    entity.number = data.number;
    entity.name = data.name;
    entity.code = data.code;
    entity.type = data.type;
    entity.isGeneral = data.isGeneral;
    entity.isDefault = data.isDefault;
    entity.isRequired = data.isRequired;
    entity.value = data.value;
    entity.description = data.description;
    entity.bitixId = data.bitixId;
    entity.bitrixTemplateId = data.bitrixTemplateId;
    entity.isActive = data.isActive;
    entity.isPlural = data.isPlural;
    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;

    if (data.template_field?.length) {
        const templates = data.template_field
            .map(tf => tf.template)
            .filter((t): t is NonNullable<typeof t> => t != null);
        entity.templates = templates.map(template =>
            createTemplateBaseEntityFromPrisma(template),
        );
    }

    return entity;
}

export function createFieldLightEntityFromEntity(
    entity: FieldEntity,
): FieldLightEntity {
    const light = new FieldLightEntity();
    light.id = entity.id;
    light.number = entity.number;
    light.name = entity.name;
    light.code = entity.code;
    light.type = entity.type;
    light.isGeneral = entity.isGeneral;
    light.isDefault = entity.isDefault;
    light.isRequired = entity.isRequired;
    light.value = entity.value;
    light.description = entity.description;
    light.bitixId = entity.bitixId;
    light.bitrixTemplateId = entity.bitrixTemplateId;
    light.isActive = entity.isActive;
    light.isPlural = entity.isPlural;
    return light;
}
