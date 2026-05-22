import { Template } from 'generated/prisma';
import {
    CounterEntity,
    CounterLightEntity,
    TemplateCounterEntity,
} from '../counter.entity';
import { createTemplateBaseEntityFromPrisma } from '../../template-base/lib/template-base-entity.util';

type TemplateCounterRow = {
    template_id: { toString(): string };
    counter_id: { toString(): string };
    value: string | null;
    prefix: string | null;
    day: boolean | null;
    year: boolean | null;
    month: boolean | null;
    count: number | null;
    size: number | null;
    templates?: Template | null;
};

type CounterPrismaData = {
    id: { toString(): string };
    name: string;
    code?: string | null;
    description?: string | null;
    created_at: Date | null;
    updated_at: Date | null;
    template_counter?: TemplateCounterRow[];
};

export function createCounterEntityFromPrisma(
    data: CounterPrismaData,
): CounterEntity {
    const entity = new CounterEntity();
    entity.id = data.id.toString();
    entity.name = data.name;
    entity.code = data.code ?? '';
    entity.description = data.description ?? null;
    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;

    if (data.template_counter) {
        entity.templates = data.template_counter.map(tc => {
            const templateCounter = new TemplateCounterEntity();
            templateCounter.template_id = tc.template_id.toString();
            templateCounter.counter_id = tc.counter_id.toString();
            templateCounter.value = tc.value ?? null;
            templateCounter.prefix = tc.prefix;
            templateCounter.day = tc.day || false;
            templateCounter.year = tc.year || false;
            templateCounter.month = tc.month || false;
            templateCounter.count = tc.count || 0;
            templateCounter.size = tc.size || 0;

            if (tc.templates) {
                templateCounter.template = createTemplateBaseEntityFromPrisma(
                    tc.templates,
                );
            }

            return templateCounter;
        });
    }

    return entity;
}

export function createCounterLightEntityFromEntity(
    entity: CounterEntity,
): CounterLightEntity {
    const light = new CounterLightEntity();
    light.id = entity.id;
    light.name = entity.name;
    light.code = entity.code;
    light.description = entity.description;
    return light;
}
