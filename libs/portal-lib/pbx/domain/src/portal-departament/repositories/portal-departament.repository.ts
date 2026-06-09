import type { departaments } from 'generated/prisma';
import type { PortalDepartamentWritable } from '../utils/portal-departament-entity.util';

export abstract class PortalDepartamentRepository {
    abstract create(data: PortalDepartamentWritable): Promise<departaments>;

    abstract findById(id: number): Promise<departaments | null>;

    /** Поиск по уникальному ключу type + group + portal_id. */
    abstract findByTypeGroupPortal(
        type: string,
        group: string,
        portalId: number,
    ): Promise<departaments | null>;

    abstract findByPortalId(portalId: number): Promise<departaments[]>;

    abstract findMany(): Promise<departaments[]>;

    abstract update(
        id: number,
        data: Partial<PortalDepartamentWritable>,
    ): Promise<departaments>;

    abstract delete(id: number): Promise<void>;
}
