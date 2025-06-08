import { TemplateBaseEntity, TemplateBasePortalEntity } from "./template-base.entity";

export abstract class TemplateBaseRepository {
    abstract findById(id: number): Promise<TemplateBaseEntity | null>;
    abstract findByCode(code: string): Promise<TemplateBaseEntity | null>;
    abstract findByDomain(domain: string): Promise<TemplateBasePortalEntity[] | null>;
    abstract findMany(): Promise<TemplateBaseEntity[] | null>;
    abstract findManyWithRelations(): Promise<TemplateBaseEntity[] | null>;

} 