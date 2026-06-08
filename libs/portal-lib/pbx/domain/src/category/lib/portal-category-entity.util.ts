import { convertToBigint, PbxEntityType } from '@/shared';
import { PortalCategoryEntity } from '../entity/portal-category.entity';
import { btx_categories, btx_stages } from 'generated/prisma';
import {
    getPbxStageEntity,
    portalStageEntityToResponseDto,
    PortalStageEntity,
} from '@lib/portal-lib/pbx-domain/stage';
import { BtxCategoryResponseDto } from '../dto/btx-category-response.dto';

type BtxCategoryWithStages = btx_categories & {
    btx_stages?: btx_stages[];
};

/** Та же схема маппинга, что private mapToResponseDto в BtxCategoryService, но в camelCase для сущностей портала. */
export const getPbxCategoryEntity = (
    category: btx_categories,
): PortalCategoryEntity => {
    const categoryWithStages = category as BtxCategoryWithStages;

    const stages: PortalStageEntity[] = (
        categoryWithStages.btx_stages ?? []
    ).map(stage => getPbxStageEntity(stage));

    return {
        id: Number(category.id),
        entityTypeId: Number(category.entity_id),
        entityType: category.entity_type as PbxEntityType,
        parentType: category.parent_type,
        type: category.type,
        group: category.group,
        title: category.title,
        name: category.name,
        bitrixId: category.bitrixId,
        bitrixCamelId: category.bitrixCamelId,
        code: category.code,
        isActive: category.isActive,
        stages,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
    };
};

export const getPbxCategoryDto = (
    category: PortalCategoryEntity,
): btx_categories => {
    return {
        id: convertToBigint(category.id),
        entity_id: convertToBigint(category.entityTypeId),
        entity_type: category.entityType,
        parent_type: category.parentType,
        type: category.type,
        group: category.group,
        title: category.title,
        name: category.name,
        bitrixId: category.bitrixId,
        bitrixCamelId: category.bitrixCamelId,
        code: category.code,
        isActive: category.isActive,
        created_at: category.createdAt,
        updated_at: category.updatedAt,
    };
};

/** Ответ контроллера / Swagger — структура совпадает с BtxCategoryResponseDto. */
export const portalCategoryEntityToResponseDto = (
    entity: PortalCategoryEntity,
): BtxCategoryResponseDto => ({
    id: entity.id,
    entity_type: entity.entityType,
    entity_id: entity.entityTypeId,
    parent_type: entity.parentType,
    type: entity.type,
    group: entity.group,
    title: entity.title,
    name: entity.name,
    bitrixId: entity.bitrixId,
    bitrixCamelId: entity.bitrixCamelId,
    code: entity.code,
    isActive: entity.isActive,
    stages: entity.stages.map(portalStageEntityToResponseDto),
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
});
