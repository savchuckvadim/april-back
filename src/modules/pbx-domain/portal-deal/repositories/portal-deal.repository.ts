import type { btx_deals } from 'generated/prisma';

export abstract class PortalDealRepository {
    abstract create(
        data: Pick<btx_deals, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_deals>;

    abstract findById(id: number): Promise<btx_deals | null>;

    abstract findFirstByPortalId(
        portalId: number,
    ): Promise<btx_deals | null>;
    abstract findMany(): Promise<btx_deals[]>;

    abstract update(
        id: number,
        data: Partial<
            Pick<btx_deals, 'name' | 'title' | 'code' | 'portal_id'>
        >,
    ): Promise<btx_deals>;

    abstract delete(id: number): Promise<void>;
}
