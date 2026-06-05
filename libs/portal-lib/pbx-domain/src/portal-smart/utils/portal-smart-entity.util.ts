import { bigintConvertToNumber } from '@/shared';
import { PortalCategoryEntity } from '@/modules/pbx-domain/category';
import { PortalSmartEntity } from '../entity/portal-smart.entity';
import { PbxFieldEntity } from '@/modules/pbx-domain/field';
import type { PortalSmartRow } from '../types/portal-smart-row.type';

export const getPortalSmartEntity = (
    smart: PortalSmartRow,
    categories: PortalCategoryEntity[],
    fields: PbxFieldEntity[],
): PortalSmartEntity => {
    return {
        id: bigintConvertToNumber(smart.id),
        portalId: bigintConvertToNumber(smart.portal_id),
        name: smart.name,
        group: smart.group,
        type: smart.type,
        title: smart.title,
        bitrixId:
            smart.bitrixId != null ? bigintConvertToNumber(smart.bitrixId) : 0,
        entityTypeId: bigintConvertToNumber(smart.entityTypeId),
        forStageId: smart.forStageId?.toString() ?? '',
        forFilterId: smart.forFilterId?.toString() ?? '',
        crmId: smart.crmId?.toString() ?? '',
        forStage: smart.forStage ?? '',
        forFilter: smart.forFilter ?? '',
        crm: smart.crm ?? '',
        categories,
        fields,
    };
};
