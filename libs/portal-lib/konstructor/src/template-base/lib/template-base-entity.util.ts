import {
    Template,
    TemplateField,
    template_counter,
    counters,
    Field,
} from 'generated/prisma';
import {
    TemplateBaseEntity,
    TemplateBaseLightEntity,
    TemplateBasePortalEntity,
} from '../template-base.entity';
import { FieldEntity } from '../../field/field.entity';
import {
    CounterEntity,
    TemplateCounterEntity,
} from '../../counter/counter.entity';
import { PrismaService } from 'src/core/prisma';

/**
 * Строка шаблона из Prisma, опционально со связями
 * `template_field.include.fields` и `template_counter.include.counters`.
 */
type TemplateBaseRow = Template & {
    template_field?: (TemplateField & { fields?: Field | null })[];
    template_counter?: (template_counter & { counters?: counters | null })[];
};

/**
 * Маппинг строки `fields` в доменную сущность поля. Дублирует логику
 * `field-entity.util`, чтобы не создавать циклический импорт между утилитами.
 */
function mapFieldEntity(field: Field): FieldEntity {
    const entity = new FieldEntity();
    entity.id = field.id.toString();
    entity.number = field.number;
    entity.name = field.name;
    entity.code = field.code;
    entity.type = field.type;
    entity.isGeneral = field.isGeneral;
    entity.isDefault = field.isDefault;
    entity.isRequired = field.isRequired;
    entity.value = field.value;
    entity.description = field.description;
    entity.bitixId = field.bitixId;
    entity.bitrixTemplateId = field.bitrixTemplateId;
    entity.isActive = field.isActive;
    entity.isPlural = field.isPlural;
    entity.created_at = field.created_at;
    entity.updated_at = field.updated_at;
    return entity;
}

/** Маппинг pivot-строки `template_counter` (со связанным счётчиком). */
function mapTemplateCounter(
    row: template_counter & { counters?: counters | null },
): TemplateCounterEntity {
    const pivot = new TemplateCounterEntity();
    pivot.template_id = row.template_id.toString();
    pivot.counter_id = row.counter_id.toString();
    pivot.value = row.value;
    pivot.prefix = row.prefix;
    pivot.day = row.day;
    pivot.year = row.year;
    pivot.month = row.month;
    pivot.count = row.count;
    pivot.size = row.size;

    if (row.counters) {
        const counter = new CounterEntity();
        counter.id = row.counters.id.toString();
        counter.name = row.counters.name;
        counter.title = row.counters.title;
        // В таблице `counters` нет колонок code/description.
        counter.code = '';
        counter.description = null;
        counter.created_at = row.counters.created_at;
        counter.updated_at = row.counters.updated_at;
        pivot.counter = counter;
    }

    return pivot;
}

export function createTemplateBaseEntityFromPrisma(
    data: TemplateBaseRow,
): TemplateBaseEntity {
    const entity = new TemplateBaseEntity();
    entity.id = data.id.toString();
    entity.name = data.name;
    entity.code = data.code;
    entity.type = data.type;
    entity.link = data.link;
    entity.portalId = data.portalId.toString();

    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;

    if (data.template_field) {
        entity.fields = data.template_field
            .map(tf => tf.fields)
            .filter((f): f is Field => f != null)
            .map(mapFieldEntity);
    }

    if (data.template_counter) {
        entity.counters = data.template_counter.map(mapTemplateCounter);
    }

    return entity;
}

export function createTemplateBaseLightEntityFromEntity(
    entity: TemplateBaseEntity,
): TemplateBaseLightEntity {
    const light = new TemplateBaseLightEntity();
    light.id = entity.id;
    light.name = entity.name;
    light.code = entity.code;

    return light;
}

export function createTemplateBasePortalEntityFromPrisma(
    data: NonNullable<Awaited<Template>>,
    fields: NonNullable<
        Awaited<ReturnType<PrismaService['field']['findUnique']>>
    >[],
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
