import {
    TemplateBaseEntity,
    TemplateBasePortalEntity,
} from './template-base.entity';

/** Данные для создания шаблона (`templates`). */
export interface CreateTemplateBaseData {
    name: string;
    code: string;
    type: string;
    link?: string | null;
    portalId: number;
}

/** Данные для частичного обновления шаблона. */
export type UpdateTemplateBaseData = Partial<CreateTemplateBaseData>;

export abstract class TemplateBaseRepository {
    abstract findById(id: number): Promise<TemplateBaseEntity | null>;
    abstract findByCode(code: string): Promise<TemplateBaseEntity | null>;
    abstract findByDomain(
        domain: string,
    ): Promise<TemplateBasePortalEntity[] | null>;
    abstract findMany(): Promise<TemplateBaseEntity[] | null>;
    abstract findManyWithRelations(): Promise<TemplateBaseEntity[] | null>;

    abstract create(data: CreateTemplateBaseData): Promise<TemplateBaseEntity>;
    abstract update(
        id: number,
        data: UpdateTemplateBaseData,
    ): Promise<TemplateBaseEntity>;
    abstract delete(id: number): Promise<void>;

    /** Привязать поле к шаблону (`template_field`). Идемпотентно. */
    abstract attachField(templateId: number, fieldId: number): Promise<void>;
    /** Отвязать поле от шаблона (`template_field`). */
    abstract detachField(templateId: number, fieldId: number): Promise<void>;
}
