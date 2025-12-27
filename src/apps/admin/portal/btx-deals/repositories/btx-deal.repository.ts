import { btx_deals } from 'generated/prisma';

export abstract class BtxDealRepository {
    abstract create(deal: Partial<btx_deals>): Promise<btx_deals | null>;
    abstract findById(id: number): Promise<btx_deals | null>;
    abstract findMany(): Promise<btx_deals[] | null>;
    abstract findByPortalId(portalId: number): Promise<btx_deals[] | null>;
    abstract update(id: number, deal: Partial<btx_deals>): Promise<btx_deals | null>;
    abstract delete(id: number): Promise<boolean>;
}

