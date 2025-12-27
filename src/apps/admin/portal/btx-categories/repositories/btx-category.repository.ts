import { btx_categories } from 'generated/prisma';

export abstract class BtxCategoryRepository {
    abstract create(category: Partial<btx_categories>): Promise<btx_categories | null>;
    abstract findById(id: number): Promise<btx_categories | null>;
    abstract findMany(): Promise<btx_categories[] | null>;
    abstract findByEntity(entityType: string, entityId: number): Promise<btx_categories[] | null>;
    abstract findByEntityAndParentType(entityType: string, entityId: number, parentType: string): Promise<btx_categories[] | null>;
    abstract update(id: number, category: Partial<btx_categories>): Promise<btx_categories | null>;
    abstract delete(id: number): Promise<boolean>;
}

