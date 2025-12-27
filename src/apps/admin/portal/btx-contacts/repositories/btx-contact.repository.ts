import { btx_contacts } from 'generated/prisma';

export abstract class BtxContactRepository {
    abstract create(contact: Partial<btx_contacts>): Promise<btx_contacts | null>;
    abstract findById(id: number): Promise<btx_contacts | null>;
    abstract findMany(): Promise<btx_contacts[] | null>;
    abstract findByPortalId(portalId: number): Promise<btx_contacts[] | null>;
    abstract update(id: number, contact: Partial<btx_contacts>): Promise<btx_contacts | null>;
    abstract delete(id: number): Promise<boolean>;
}

