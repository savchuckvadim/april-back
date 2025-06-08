import { TemplateBaseEntity } from "../template-base/template-base.entity";

export class FieldEntity {
    id: string;
    number: number;
    name: string;
    code: string;
    type: string | null;
    isGeneral: boolean;
    isDefault: boolean;
    isRequired: boolean;
    value: string | null;
    description: string | null;
    bitixId: string | null;
    bitrixTemplateId: string | null;
    isActive: boolean;
    isPlural: boolean;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    templates?: TemplateBaseEntity[];
}

export class FieldLightEntity {
    id: string;
    number: number;
    name: string;
    code: string;
    type: string | null;
    isGeneral: boolean;
    isDefault: boolean;
    isRequired: boolean;
    value: string | null;
    description: string | null;
    bitixId: string | null;
    bitrixTemplateId: string | null;
    isActive: boolean;
    isPlural: boolean;
} 