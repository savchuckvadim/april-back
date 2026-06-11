import type { btx_contacts } from 'generated/prisma';

export abstract class PortalContactRepository {
    abstract create(
        data: Pick<btx_contacts, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_contacts>;

    abstract findById(id: number): Promise<btx_contacts | null>;

    abstract findFirstByPortalId(
        portalId: number,
    ): Promise<btx_contacts | null>;
    abstract findMany(): Promise<btx_contacts[]>;

    abstract update(
        id: number,
        data: Partial<
            Pick<btx_contacts, 'name' | 'title' | 'code' | 'portal_id'>
        >,
    ): Promise<btx_contacts>;

    abstract delete(id: number): Promise<void>;
}
