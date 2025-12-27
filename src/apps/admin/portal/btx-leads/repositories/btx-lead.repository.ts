import { btx_leads } from 'generated/prisma';

export abstract class BtxLeadRepository {
    abstract create(lead: Partial<btx_leads>): Promise<btx_leads | null>;
    abstract findById(id: number): Promise<btx_leads | null>;
    abstract findMany(): Promise<btx_leads[] | null>;
    abstract findByPortalId(portalId: number): Promise<btx_leads[] | null>;
    abstract update(id: number, lead: Partial<btx_leads>): Promise<btx_leads | null>;
    abstract delete(id: number): Promise<boolean>;
}

