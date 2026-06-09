import { PbxFieldEntity } from '@lib/portal-lib/pbx-domain/field';
import { PortalCategoryEntity } from '@lib/portal-lib/pbx-domain/category';

/**
 * RPA-процесс портала в camelCase-виде (аналог `PortalSmartEntity`).
 * У RPA, в отличие от смарта, ровно одна категория (воронка) — поле `category`.
 */
export class PortalRpaEntity {
    id: number;
    portalId: number;
    name: string;
    title: string;
    code: string;
    type: string;
    typeId: string;
    bitrixId: number | null;
    entityTypeId: number | null;
    image: string | null;
    description: string | null;
    category: PortalCategoryEntity | null;
    fields: PbxFieldEntity[];
}
