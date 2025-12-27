import { btx_rpas } from 'generated/prisma';

export abstract class BtxRpaRepository {
    abstract create(rpa: Partial<btx_rpas>): Promise<btx_rpas | null>;
    abstract findById(id: number): Promise<btx_rpas | null>;
    abstract findMany(): Promise<btx_rpas[] | null>;
    abstract findByPortalId(portalId: number): Promise<btx_rpas[] | null>;
    abstract update(id: number, rpa: Partial<btx_rpas>): Promise<btx_rpas | null>;
    abstract delete(id: number): Promise<boolean>;
}

