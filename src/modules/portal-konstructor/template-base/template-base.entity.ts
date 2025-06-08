import { CounterEntity, TemplateCounterEntity } from "../counter/counter.entity";
import { FieldEntity, FieldLightEntity } from "../field/field.entity";

export class TemplateBaseEntity {
    id: string;
    name: string;
    code: string;
    description: string | null;
    isActive: boolean;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    counters?: TemplateCounterEntity[];
    fields?: FieldEntity[];
}

export class TemplateBaseLightEntity {
    id: string;
    name: string;
    code: string;
    description: string | null;
    isActive: boolean;
} 

export class TemplateBasePortalEntity {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    fields: FieldLightEntity[];
} 