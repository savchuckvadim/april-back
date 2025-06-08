import { TemplateBaseEntity } from "../template-base/template-base.entity";

export class CounterEntity {
    id: string;
    name: string;
    code: string;
    description: string | null;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    templates?: TemplateCounterEntity[];
}

export class CounterLightEntity {
    id: string;
    name: string;
    code: string;
    description: string | null;
}

export class TemplateCounterEntity {
    template_id: string;
    counter_id: string;
    value: string | null;
    prefix: string | null;
    day: boolean;
    year: boolean;
    month: boolean;
    count: number;
    size: number;

    // Relations
    counter?: CounterEntity;
    template?: TemplateBaseEntity;
} 