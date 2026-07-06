import { bigintConvertToNumber } from '@/shared';
import { PbxFieldEntity } from '@lib/portal-lib/pbx-domain/field';
import { PortalListEntity } from '../entity/portal-list.entity';
import type { PortalListRow } from '../types/portal-list-row.type';

/** Код списка в конвенции легаси-потребителей (portal.model.getListByCode) */
export const getPortalListCode = (group: string, type: string): string =>
    `${group}_${type}`;

export const getPortalListEntity = (
    list: PortalListRow,
    fields: PbxFieldEntity[],
): PortalListEntity => {
    return {
        id: bigintConvertToNumber(list.id),
        portalId: bigintConvertToNumber(list.portal_id),
        name: list.name,
        group: list.group,
        type: list.type,
        title: list.title,
        bitrixId: bigintConvertToNumber(list.bitrixId),
        code: getPortalListCode(list.group, list.type),
        fields,
    };
};
