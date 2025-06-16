import { PortalEntity } from "./portal.entity";

export abstract class PortalRepository {
    abstract findById(id: number): Promise<PortalEntity | null>;
    abstract findMany(): Promise<PortalEntity[] | null>;
    abstract findManyWithRelations(): Promise<PortalEntity[] | null>;
    abstract findByDomain(domain: string): Promise<PortalEntity | null>;
    abstract updateWebhook(domain: string, webhook: string): Promise<PortalEntity | null>;
} 