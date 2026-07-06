import { PbxFieldEntity } from '@lib/portal-lib/pbx-domain/field';

export class PortalListEntity {
    id: number;
    portalId: number;
    name: string;
    group: string;
    type: string;
    title: string;
    bitrixId: number;
    /** Код списка (IBLOCK_CODE) вычисляется как `${group}_${type}` */
    code: string;
    fields: PbxFieldEntity[];
}
