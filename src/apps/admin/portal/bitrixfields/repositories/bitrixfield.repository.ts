import { bitrixfields } from 'generated/prisma';

export abstract class BitrixFieldRepository {
    abstract create(field: Partial<bitrixfields>): Promise<bitrixfields | null>;
    abstract findById(id: number): Promise<bitrixfields | null>;
    abstract findMany(): Promise<bitrixfields[] | null>;
    abstract findByEntity(entityType: string, entityId: number): Promise<bitrixfields[] | null>;
    abstract findByEntityAndParentType(entityType: string, entityId: number, parentType: string): Promise<bitrixfields[] | null>;
    abstract update(id: number, field: Partial<bitrixfields>): Promise<bitrixfields | null>;
    abstract delete(id: number): Promise<boolean>;
}

