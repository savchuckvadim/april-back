import { bigintConvertToNumber, convertToBigint } from '@/shared';
import { btx_stages } from 'generated/prisma';
import { PortalStageEntity } from '../entity/portal-stage.entity';
import { BtxStageResponseDto } from '../dto/btx-stage-response.dto';

export const getPbxStageEntity = (stage: btx_stages): PortalStageEntity => {
    return {
        id: bigintConvertToNumber(stage.id),
        btxCategoryId: bigintConvertToNumber(stage.btx_category_id),
        name: stage.name,
        title: stage.title,
        code: stage.code,
        bitrixId: stage.bitrixId,
        color: stage.color,
        isActive: stage.isActive,
        createdAt: stage.created_at,
        updatedAt: stage.updated_at,
    };
};

export const getPbxStageDto = (stage: PortalStageEntity): btx_stages => {
    return {
        id: convertToBigint(stage.id),
        btx_category_id: convertToBigint(stage.btxCategoryId),
        name: stage.name,
        title: stage.title,
        code: stage.code,
        bitrixId: stage.bitrixId,
        color: stage.color,
        isActive: stage.isActive,
        created_at: stage.createdAt,
        updated_at: stage.updatedAt,
    };
};

/** HTTP / Swagger DTO (snake_case поля как в API). */
export const portalStageEntityToResponseDto = (
    entity: PortalStageEntity,
): BtxStageResponseDto => ({
    id: entity.id,
    btx_category_id: entity.btxCategoryId,
    name: entity.name,
    title: entity.title,
    code: entity.code,
    bitrixId: entity.bitrixId,
    color: entity.color,
    isActive: entity.isActive,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
});
