import { CounterEntity, CounterLightEntity, TemplateCounterEntity } from "../counter.entity";
import { createTemplateBaseEntityFromPrisma } from "../../template-base/lib/template-base-entity.util";

export function createCounterEntityFromPrisma(data: any): CounterEntity {
    const entity = new CounterEntity();
    entity.id = data.id.toString();
    entity.name = data.name;
    entity.code = data.code;
    entity.description = data.description;
    entity.created_at = data.created_at;
    entity.updated_at = data.updated_at;

    if (data.template_counter) {
        entity.templates = data.template_counter.map(tc => {
            const templateCounter = new TemplateCounterEntity();
            templateCounter.template_id = tc.template_id.toString();
            templateCounter.counter_id = tc.counter_id.toString();
            templateCounter.value = tc.value;
            templateCounter.prefix = tc.prefix;
            templateCounter.day = tc.day;
            templateCounter.year = tc.year;
            templateCounter.month = tc.month;
            templateCounter.count = tc.count;
            templateCounter.size = tc.size;

            if (tc.templates) {
                templateCounter.template = createTemplateBaseEntityFromPrisma(tc.templates);
            }

            return templateCounter;
        });
    }

    return entity;
}

export function createCounterLightEntityFromEntity(entity: CounterEntity): CounterLightEntity {
    const light = new CounterLightEntity();
    light.id = entity.id;
    light.name = entity.name;
    light.code = entity.code;
    light.description = entity.description;
    return light;
} 