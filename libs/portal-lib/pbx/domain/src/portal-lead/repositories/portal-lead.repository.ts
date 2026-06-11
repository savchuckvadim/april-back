import type { btx_leads } from 'generated/prisma';

export abstract class PortalLeadRepository {
    abstract create(
        data: Pick<btx_leads, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_leads>;

    abstract findById(id: number): Promise<btx_leads | null>;

    abstract findFirstByPortalId(portalId: number): Promise<btx_leads | null>;
    abstract findMany(): Promise<btx_leads[]>;

    abstract update(
        id: number,
        data: Partial<Pick<btx_leads, 'name' | 'title' | 'code' | 'portal_id'>>,
    ): Promise<btx_leads>;

    abstract delete(id: number): Promise<void>;
}
