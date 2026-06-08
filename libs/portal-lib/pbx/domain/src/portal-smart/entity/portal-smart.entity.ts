import { PbxFieldEntity } from '@lib/portal-lib/pbx-domain/field';
import { PortalCategoryEntity } from '@lib/portal-lib/pbx-domain/category';

export class PortalSmartEntity {
    id: number;
    portalId: number;
    name: string;
    group: string;
    type: string;
    title: string;
    bitrixId: number;
    entityTypeId: number;
    forStageId: string;
    forFilterId: string;
    crmId: string;
    forStage: string;
    forFilter: string;
    crm: string;
    categories: PortalCategoryEntity[];
    fields: PbxFieldEntity[];
}
