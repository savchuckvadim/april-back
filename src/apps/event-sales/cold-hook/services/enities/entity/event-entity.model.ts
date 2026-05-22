import { IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { ColdEntityCodesEnum } from './cold-entity.type';
import { findPbxSalesEventField } from '@/modules/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { IField, IFieldItem } from '@/modules/portal/interfaces/portal.interface';

export class EventEntityModel {
    private readonly eventTypeName = 'Холодный обзвон';
    constructor(
        private readonly portal: PortalModel,
        private readonly entity: IBXCompany | IBXLead | IBXDeal,
        private readonly entityType: EnumColdCallEntityType,

        private readonly eventName: string,
        private readonly eventComment: string,
        private readonly eventDeadline: string,
        private readonly eventResponsible: string,
        private readonly eventXoCreated: string,
    ) { }

    public getNextValues(): Record<string, number | string | string[]> {
        const result = {} as Record<string, number | string | string[]>; //'UF_CRM_999999' : 'value'

        Object.values(ColdEntityCodesEnum).forEach(
            (code: ColdEntityCodesEnum) => {
                const value = this.getCurrentValueByCode(code);
                const field = this.getPortalFieldByCode(code);
                if (!field) return;
                const bitrixId = this.getBitrixIdByPortalField(field);
                if (!this.hasField(bitrixId)) return;
                result[bitrixId] = value ?? '';
                switch (code) {
                    case ColdEntityCodesEnum.xo_name:
                        result[bitrixId] = this.eventName;
                        break;
                    case ColdEntityCodesEnum.xo_date:
                        result[bitrixId] = this.eventDeadline;
                        break;
                    case ColdEntityCodesEnum.call_next_date:
                        result[bitrixId] = this.eventDeadline;
                        break;
                    case ColdEntityCodesEnum.call_last_date:
                        result[bitrixId] = this.eventDeadline;
                        break;
                    case ColdEntityCodesEnum.xo_responsible:
                        result[bitrixId] = this.eventResponsible;
                        break;
                    case ColdEntityCodesEnum.manager_op:
                        result[bitrixId] = this.eventResponsible;
                        break;
                    case ColdEntityCodesEnum.xo_created:
                        result[bitrixId] = this.eventXoCreated;
                        break;
                    case ColdEntityCodesEnum.op_history:
                        result[bitrixId] = this.getNextStringHistory();
                        break;
                    case ColdEntityCodesEnum.op_mhistory:
                        result[bitrixId] = this.getNextStringMHistory();
                        break;
                    case ColdEntityCodesEnum.op_current_status:
                        result[bitrixId] = this.getEventName();
                        break;
                    case ColdEntityCodesEnum.op_work_status:
                        result[bitrixId] = this.getNextOpWorkStatus();
                        break;
                    case ColdEntityCodesEnum.op_prospects_type:
                        result[bitrixId] = this.getNextOpProspectsType();
                        break;
                }
            },
        );
        return result;
    }
    private getEventName() {
        const eventName = this.eventTypeName + ' ' + this.eventName;
        return eventName;
    }

    private getCurrentValueByCode(code: ColdEntityCodesEnum) {
        const pField = this.getPortalFieldByCode(code);
        if (!pField) return undefined;
        const bitrixId = this.getBitrixIdByPortalField(pField);
        if (this.hasField(bitrixId)) {
            return (this.entity[bitrixId] || '') as string | string[];
        }
        return undefined;
    }
    private hasField(bitrixId: string) {
        return Object.hasOwn(this.entity, bitrixId) !== undefined;
    }
    private getPortalFieldByCode(code: ColdEntityCodesEnum) {
        return this.portal.getEntityFieldByCode(this.entityType, code);
    }
    //next values
    private getNextStringHistory() {
        const currentValue: string = (this.getCurrentValueByCode(
            ColdEntityCodesEnum.op_history,
        ) ?? '') as string;
        return (
            currentValue + this.eventComment + '\n' + this.eventDeadline + '\n'
        );
    }
    private getNextStringMHistory() {
        const currentValue: string[] = (this.getCurrentValueByCode(
            ColdEntityCodesEnum.op_mhistory,
        ) ?? []) as string[];
        let nextValue = this.eventComment + '\n' + this.eventDeadline;

        if (currentValue) {
            nextValue = currentValue.join('\n') + '\n' + nextValue;
        }
        return nextValue;
    }

    private getNextOpWorkStatus() {
        const field = findPbxSalesEventField('op_work_status');
        const targetItem = field?.items.find(
            item => item.code === 'op_status_in_work',
        );

        const currentPortalField = this.getPortalFieldByCode(
            ColdEntityCodesEnum.op_work_status,
        );
        const portalItem = currentPortalField?.items.find(
            item => item.code === targetItem?.code,
        );
        return portalItem?.bitrixId ?? '';
    }

    private getNextOpProspectsType() {
        const field = findPbxSalesEventField('op_prospects_type');
        const targetItem = field?.items.find(
            item => item.name === 'Перспективная',
        );

        const currentPortalField = this.getPortalFieldByCode(
            ColdEntityCodesEnum.op_work_status,
        );
        const portalItem = currentPortalField?.items.find(
            item => item.code === targetItem?.code,
        );
        return portalItem?.bitrixId ?? '';
    }

    private getBitrixIdByPortalField(field: IField) {
        return field?.bitrixId ? `UF_CRM_${field.bitrixId}` : '';
    }
}
