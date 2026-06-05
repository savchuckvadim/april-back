import { btx_stages } from 'generated/prisma';
import { PortalStageEntity } from '../entity/portal-stage.entity';

export abstract class BtxStageRepository {
    abstract create(
        stage: Partial<btx_stages>,
    ): Promise<PortalStageEntity | null>;
    abstract createMany(stages: Partial<btx_stages>[]): Promise<number>;
    abstract findById(id: number): Promise<PortalStageEntity | null>;
    abstract findByCategoryId(
        categoryId: number,
    ): Promise<PortalStageEntity[] | null>;
    abstract update(
        id: number,
        stage: Partial<btx_stages>,
    ): Promise<PortalStageEntity | null>;
    abstract delete(id: number): Promise<boolean>;
    abstract deleteByCategoryId(categoryId: number): Promise<number>;
}
