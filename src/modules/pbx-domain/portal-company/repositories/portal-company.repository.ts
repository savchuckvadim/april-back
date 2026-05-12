import type { btx_companies } from 'generated/prisma';

export abstract class PortalCompanyRepository {
    abstract create(
        data: Pick<btx_companies, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_companies>;

    abstract findById(id: number): Promise<btx_companies | null>;

    abstract findFirstByPortalId(
        portalId: number,
    ): Promise<btx_companies | null>;
    abstract findMany(): Promise<btx_companies[]>;

    abstract update(
        id: number,
        data: Partial<
            Pick<btx_companies, 'name' | 'title' | 'code' | 'portal_id'>
        >,
    ): Promise<btx_companies>;

    abstract delete(id: number): Promise<void>;
}
