import { PortalStageEntity } from '@/modules/pbx-domain/stage';

/** Категория портала (та же логика, что mapToResponseDto в BtxCategoryService, camelCase). */
export class PortalCategoryEntity {
    id: number;
    entityTypeId: number;
    entityType: string;
    parentType: string;
    type: string;
    group: string;
    title: string;
    name: string;
    bitrixId: string;
    bitrixCamelId: string;
    code: string;
    isActive: boolean;
    stages: PortalStageEntity[];
    createdAt: Date | null;
    updatedAt: Date | null;
}
