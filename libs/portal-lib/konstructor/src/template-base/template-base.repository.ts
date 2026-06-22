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

/** Pivot-данные связи «шаблон ↔ счётчик» (`template_counter`). */
export interface TemplateCounterPivotData {
    value?: string | null;
    prefix?: string | null;
    day?: boolean;
    year?: boolean;
    month?: boolean;
    count?: number;
    size?: number;
}

export abstract class TemplateBaseRepository {
    abstract findById(id: number): Promise<TemplateBaseEntity | null>;
    abstract findByCode(code: string): Promise<TemplateBaseEntity | null>;
    abstract findByDomain(
        domain: string,
    ): Promise<TemplateBasePortalEntity[] | null>;
    /** Шаблоны портала (по `portalId`) со связями поля/счётчики. */
    abstract findManyByPortalId(
        portalId: number,
    ): Promise<TemplateBaseEntity[] | null>;
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

    /**
     * Привязать счётчик к шаблону (`template_counter`) с pivot-данными.
     * Идемпотентно: повторный вызов обновляет pivot.
     */
    abstract attachCounter(
        templateId: number,
        counterId: number,
        data: TemplateCounterPivotData,
    ): Promise<void>;
    /** Обновить pivot связи «шаблон ↔ счётчик». */
    abstract updateCounter(
        templateId: number,
        counterId: number,
        data: TemplateCounterPivotData,
    ): Promise<void>;
    /** Отвязать счётчик от шаблона (`template_counter`). */
    abstract detachCounter(
        templateId: number,
        counterId: number,
    ): Promise<void>;
}
