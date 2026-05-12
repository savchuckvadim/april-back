import { btx_categories } from 'generated/prisma';
import { PortalCategoryEntity } from '../entity/portal-category.entity';

export abstract class BtxCategoryRepository {
    abstract create(
        category: Partial<btx_categories>,
    ): Promise<PortalCategoryEntity | null>;
    abstract findById(id: number): Promise<PortalCategoryEntity | null>;
    abstract findMany(): Promise<PortalCategoryEntity[] | null>;
    abstract findByEntity(
        entityType: string,
        entityId: number,
    ): Promise<PortalCategoryEntity[] | null>;
    abstract findByEntityAndParentType(
        entityType: string,
        entityId: number,
        parentType: string,
    ): Promise<PortalCategoryEntity[] | null>;
    abstract update(
        id: number,
        category: Partial<btx_categories>,
    ): Promise<PortalCategoryEntity | null>;
    abstract delete(id: number): Promise<boolean>;
}
