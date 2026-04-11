import { BxRequisiteRepository } from '../repository/bx-requisite.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXRequisite } from '../interface/bx-requisite.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxRequisiteBatchService {
    private repo: BxRequisiteRepository;

    clone(api: BitrixBaseApi): BxRequisiteBatchService {
        const instance = new BxRequisiteBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRequisiteRepository(api);
    }

    get(cmdCode: string, id: number | string, select?: string[]) {
        return this.repo.getBtch(cmdCode, id, select);
    }

    getList(
        cmdCode: string,
        filter: Partial<IBXRequisite>,
        select?: string[],
    ) {
        return this.repo.getListBtch(cmdCode, filter, select);
    }

    add(cmdCode: string, data: Partial<IBXRequisite>) {
        return this.repo.addBtch(cmdCode, data);
    }

    update(
        cmdCode: string,
        id: number | string,
        data: Partial<IBXRequisite>,
    ) {
        return this.repo.updateBtch(cmdCode, id, data);
    }

    delete(cmdCode: string, id: number | string) {
        return this.repo.deleteBtch(cmdCode, id);
    }

    getField(cmdCode: string, id: number | string) {
        return this.repo.getFieldBtch(cmdCode, id);
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
