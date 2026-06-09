import type { bx_rqs } from 'generated/prisma';
import type { PortalRqWritable } from '../utils/portal-rq-entity.util';

export abstract class PortalRqRepository {
    abstract create(data: PortalRqWritable): Promise<bx_rqs>;

    abstract findById(id: number): Promise<bx_rqs | null>;

    /** Поиск по уникальному ключу code + portal_id. */
    abstract findByCodePortal(
        code: string,
        portalId: number,
    ): Promise<bx_rqs | null>;

    abstract findByPortalId(portalId: number): Promise<bx_rqs[]>;

    abstract findMany(): Promise<bx_rqs[]>;

    abstract update(
        id: number,
        data: Partial<PortalRqWritable>,
    ): Promise<bx_rqs>;

    abstract delete(id: number): Promise<void>;
}
