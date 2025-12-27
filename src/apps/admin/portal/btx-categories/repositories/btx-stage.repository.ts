import { btx_stages } from 'generated/prisma';

export abstract class BtxStageRepository {
    abstract create(stage: Partial<btx_stages>): Promise<btx_stages | null>;
    abstract createMany(stages: Partial<btx_stages>[]): Promise<number>;
    abstract findById(id: number): Promise<btx_stages | null>;
    abstract findByCategoryId(categoryId: number): Promise<btx_stages[] | null>;
    abstract update(id: number, stage: Partial<btx_stages>): Promise<btx_stages | null>;
    abstract delete(id: number): Promise<boolean>;
    abstract deleteByCategoryId(categoryId: number): Promise<number>;
}

