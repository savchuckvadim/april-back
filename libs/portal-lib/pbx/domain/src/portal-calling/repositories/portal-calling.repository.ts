import type { callings } from 'generated/prisma';
import type { PortalCallingWritable } from '../utils/portal-calling-entity.util';

export abstract class PortalCallingRepository {
    abstract create(data: PortalCallingWritable): Promise<callings>;

    abstract findById(id: number): Promise<callings | null>;

    /** Поиск по уникальному ключу type + group + portal_id. */
    abstract findByTypeGroupPortal(
        type: string,
        group: string,
        portalId: number,
    ): Promise<callings | null>;

    abstract findByPortalId(portalId: number): Promise<callings[]>;

    abstract findMany(): Promise<callings[]>;

    abstract update(
        id: number,
        data: Partial<PortalCallingWritable>,
    ): Promise<callings>;

    abstract delete(id: number): Promise<void>;
}
