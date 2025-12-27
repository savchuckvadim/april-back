import { Client } from 'generated/prisma';

export abstract class ClientRepository {
    abstract create(client: Partial<Client>): Promise<Client | null>;
    abstract findById(id: number): Promise<Client | null>;
    abstract findMany(): Promise<Client[] | null>;
    abstract findByEmail(email: string): Promise<Client | null>;
    abstract findByStatus(status: string): Promise<Client[] | null>;
    abstract findByIsActive(isActive: boolean): Promise<Client[] | null>;
    abstract findByPortalId(portalId: number): Promise<Client[] | null>;
    abstract findByUserId(userId: number): Promise<Client[] | null>;
    abstract update(id: number, client: Partial<Client>): Promise<Client | null>;
    abstract delete(id: number): Promise<boolean>;
}

