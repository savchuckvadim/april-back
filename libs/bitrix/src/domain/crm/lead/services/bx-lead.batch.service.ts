import { BxLeadRepository } from '../repository/bx-lead.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXLead } from '../interface/bx-lead.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxLeadBatchService {
    private repo: BxLeadRepository;

    clone(api: BitrixBaseApi): BxLeadBatchService {
        const instance = new BxLeadBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxLeadRepository(api);
    }

    get(cmdCode: string, leadId: number | string, select?: string[]) {
        return this.repo.getBtch(cmdCode, leadId, select);
    }

    getList(
        cmdCode: string,
        filter: Partial<IBXLead>,
        select?: string[],
        order?: { [key in keyof IBXLead]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return this.repo.getListBtch(cmdCode, filter, select, order);
    }

    add(cmdCode: string, data: Partial<IBXLead>) {
        return this.repo.addBtch(cmdCode, data);
    }

    update(cmdCode: string, leadId: number | string, data: Partial<IBXLead>) {
        return this.repo.updateBtch(cmdCode, leadId, data);
    }

    delete(cmdCode: string, leadId: number | string) {
        return this.repo.deleteBtch(cmdCode, leadId);
    }

    getField(cmdCode: string, id: number | string) {
        return this.repo.getFieldBtch(cmdCode, id);
    }

    getFieldList(
        cmdCode: string,
        filter: { [key: string]: any },
        select?: string[],
    ) {
        return this.repo.getFieldListBtch(cmdCode, filter, select);
    }

    addField(cmdCode: string, fields: Partial<IBXField>) {
        return this.repo.addFieldBtch(cmdCode, fields);
    }

    updateField(
        cmdCode: string,
        id: number | string,
        fields: Partial<IBXField>,
    ) {
        return this.repo.updateFieldBtch(cmdCode, id, fields);
    }

    deleteField(cmdCode: string, id: number | string) {
        return this.repo.deleteFieldBtch(cmdCode, id);
    }
}
