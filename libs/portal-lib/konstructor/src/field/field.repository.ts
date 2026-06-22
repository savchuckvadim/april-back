import { FieldEntity } from './field.entity';

/** Данные для создания поля конструктора (`fields`). */
export interface CreateFieldData {
    number: number;
    name: string;
    code: string;
    type: string;
    isGeneral: boolean;
    isDefault: boolean;
    isRequired: boolean;
    value?: string | null;
    description?: string | null;
    bitixId?: string | null;
    bitrixTemplateId?: string | null;
    isActive: boolean;
    isPlural: boolean;
    isClient?: boolean | null;
}

/** Данные для частичного обновления поля. */
export type UpdateFieldData = Partial<CreateFieldData>;

export abstract class FieldRepository {
    abstract findById(id: number): Promise<FieldEntity | null>;
    abstract findByCode(code: string): Promise<FieldEntity | null>;
    abstract findMany(): Promise<FieldEntity[] | null>;
    abstract findManyWithRelations(): Promise<FieldEntity[] | null>;

    abstract create(data: CreateFieldData): Promise<FieldEntity>;
    abstract update(id: number, data: UpdateFieldData): Promise<FieldEntity>;
    abstract delete(id: number): Promise<void>;
}
