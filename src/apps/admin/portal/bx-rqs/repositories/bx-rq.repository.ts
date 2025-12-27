import { bx_rqs } from 'generated/prisma';

export abstract class BxRqRepository {
    abstract create(rq: Partial<bx_rqs>): Promise<bx_rqs | null>;
    abstract findById(id: number): Promise<bx_rqs | null>;
    abstract findMany(): Promise<bx_rqs[] | null>;
    abstract findByPortalId(portalId: number): Promise<bx_rqs[] | null>;
    abstract update(id: number, rq: Partial<bx_rqs>): Promise<bx_rqs | null>;
    abstract delete(id: number): Promise<boolean>;
}

