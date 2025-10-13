import { BitrixService } from 'src/modules/bitrix';
import { PortalModel } from 'src/modules/portal/services/portal.model';

enum ColdEntityCodesEnum {
    xo_name = 'xo_name',
    call_next_name = 'call_next_name',
    xo_date = 'xo_date',
    call_next_date = 'call_next_date',
    call_last_date = 'call_last_date',
    xo_responsible = 'xo_responsible',
    manager_op = 'manager_op',
    xo_created = 'xo_created',
    op_history = 'op_history',
    op_mhistory = 'op_mhistory',
    op_current_status = 'op_current_status',
    op_work_status = 'op_work_status',
    op_prospects_type = 'op_prospects_type',
}
export class ColdCallBxEntityService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async flow(
        name: string,
        deadline: string,
        responsible: string,
        xoCreated: string,
    ) {}

    private getEntityFields(
        name: string,
        deadline: string,
        responsible: string,
        manager_op: string,
        xo_created: string,
        op_history: string,
        op_mhistory: string,
        op_current_status: string,
        op_work_status: string,
        op_prospects_type: string,
    ) {
        const coldEntityCodes = [
            ColdEntityCodesEnum.xo_name,
            ColdEntityCodesEnum.call_next_name,
            ColdEntityCodesEnum.xo_date,
            ColdEntityCodesEnum.call_next_date,
            ColdEntityCodesEnum.call_last_date,
            ColdEntityCodesEnum.xo_responsible,
            ColdEntityCodesEnum.manager_op,
            ColdEntityCodesEnum.xo_created,
            ColdEntityCodesEnum.op_history,
            ColdEntityCodesEnum.op_mhistory,
            ColdEntityCodesEnum.op_current_status,
            ColdEntityCodesEnum.op_work_status,
            ColdEntityCodesEnum.op_prospects_type,
        ] as ColdEntityCodesEnum[];
        const result = {}; //'UF_CRM_999999' : 'value'
        for (const code of coldEntityCodes) {
            const field = this.portal.getCompanyFieldByCode(code);
            if (!field) continue;
            switch (code) {
                case ColdEntityCodesEnum.xo_name:
                    result[field.bitrixId] = name;
                    break;
                case ColdEntityCodesEnum.xo_date:
                    result[field.bitrixId] = deadline;
                    break;
                case ColdEntityCodesEnum.call_next_date:
                    result[field.bitrixId] = deadline;
                    break;
                case ColdEntityCodesEnum.call_last_date:
                    result[field.bitrixId] = deadline;
                    break;
                case ColdEntityCodesEnum.xo_responsible:
                    result[field.bitrixId] = responsible;
                    break;
                case ColdEntityCodesEnum.manager_op:
                    result[field.bitrixId] = manager_op;
                    break;
                case ColdEntityCodesEnum.xo_created:
                    result[field.bitrixId] = xo_created;
                    break;
                case ColdEntityCodesEnum.op_history:
                    result[field.bitrixId] = op_history;
                    break;
                case ColdEntityCodesEnum.op_mhistory:
                    result[field.bitrixId] = op_mhistory;
                    break;
                case ColdEntityCodesEnum.op_current_status:
                    result[field.bitrixId] = op_current_status;
                    break;
                case ColdEntityCodesEnum.op_work_status:
                    result[field.bitrixId] = op_work_status;
                    break;
                case ColdEntityCodesEnum.op_prospects_type:
                    result[field.bitrixId] = op_prospects_type;
                    break;
            }
        }
        return result;
    }
}
