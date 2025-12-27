import { bitrixfield_items } from 'generated/prisma';

export abstract class BitrixFieldItemRepository {
    abstract create(item: Partial<bitrixfield_items>): Promise<bitrixfield_items | null>;
    abstract createMany(items: Partial<bitrixfield_items>[]): Promise<number>;
    abstract findById(id: number): Promise<bitrixfield_items | null>;
    abstract findByFieldId(fieldId: number): Promise<bitrixfield_items[] | null>;
    abstract update(id: number, item: Partial<bitrixfield_items>): Promise<bitrixfield_items | null>;
    abstract delete(id: number): Promise<boolean>;
    abstract deleteByFieldId(fieldId: number): Promise<number>;
}

