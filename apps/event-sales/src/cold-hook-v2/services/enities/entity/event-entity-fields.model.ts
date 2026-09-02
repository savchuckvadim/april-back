import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ColdEntityCodesEnum } from './cold-entity.type';
import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';

export class EventColdCallEntityTargetFieldsModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly entityType: EnumColdCallEntityType,
    ) {}

    public getBitrixIds(): string[] {
        const fieldsBitrixIds: string[] = [];
        Object.values(ColdEntityCodesEnum).forEach(
            (code: ColdEntityCodesEnum) => {
                const field = this.getPortalFieldByCode(code);
                if (!field) return;
                const fieldBitrixId = this.getBitrixIdByPortalField(field);
                fieldsBitrixIds.push(fieldBitrixId);
            },
        );
        return fieldsBitrixIds;
    }

    private getPortalFieldByCode(code: ColdEntityCodesEnum) {
        return this.portal.getEntityFieldByCode(this.entityType, code);
    }
    //next values

    private getBitrixIdByPortalField(field: IField) {
        return field?.bitrixId ? `UF_CRM_${field.bitrixId}` : '';
    }
}
