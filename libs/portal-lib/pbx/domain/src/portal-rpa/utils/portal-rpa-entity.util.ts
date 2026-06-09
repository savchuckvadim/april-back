import { bigintConvertToNumber } from '@/shared';
import { PbxFieldEntity } from '@lib/portal-lib/pbx-domain/field';
import { PortalCategoryEntity } from '@lib/portal-lib/pbx-domain/category';
import { PortalRpaEntity } from '../entity/portal-rpa.entity';
import type { PortalRpaRow } from '../types/portal-rpa-row.type';

export const getPortalRpaEntity = (
    rpa: PortalRpaRow,
    category: PortalCategoryEntity | null,
    fields: PbxFieldEntity[],
): PortalRpaEntity => {
    return {
        id: bigintConvertToNumber(rpa.id),
        portalId: bigintConvertToNumber(rpa.portal_id),
        name: rpa.name,
        title: rpa.title,
        code: rpa.code,
        type: rpa.type,
        typeId: rpa.typeId,
        bitrixId:
            rpa.bitrixId != null ? bigintConvertToNumber(rpa.bitrixId) : null,
        entityTypeId:
            rpa.entityTypeId != null
                ? bigintConvertToNumber(rpa.entityTypeId)
                : null,
        image: rpa.image,
        description: rpa.description,
        category,
        fields,
    };
};
