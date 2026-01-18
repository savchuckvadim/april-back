import { Portal } from 'generated/prisma';
import { AdminPortalWithRelations } from '../type/admin-portal.type';

export abstract class AdminPortalRepository {
    abstract create(portal: Partial<Portal>): Promise<Portal | null>;
    abstract findById(id: number): Promise<AdminPortalWithRelations | null>;
    abstract findMany(): Promise<Portal[] | null>;
    abstract findByDomain(domain: string): Promise<Portal | null>;
    abstract findByClientId(clientId: number): Promise<Portal[] | null>;
    abstract update(id: number, portal: Partial<Portal>): Promise<Portal | null>;
    abstract delete(id: number): Promise<boolean>;
}

