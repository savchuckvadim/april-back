import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxRequisiteLinkRepository } from '../repository/bx-requisite-link.repository';
import {
    IBXRequisiteLink,
    IBXRequisiteLinkGetRequest,
    IBXRequisiteLinkRegisterFields,
} from '../interface/bx-requisite-link.interface';

/** Batch-вариант crm.requisite.link.* — для обходов графа связей. */
export class BxRequisiteLinkBatchService {
    private repo: BxRequisiteLinkRepository;

    clone(api: BitrixBaseApi): BxRequisiteLinkBatchService {
        const instance = new BxRequisiteLinkBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRequisiteLinkRepository(api);
    }

    get(cmdCode: string, data: IBXRequisiteLinkGetRequest) {
        return this.repo.getBtch(cmdCode, data);
    }

    getList(
        cmdCode: string,
        filter: Partial<IBXRequisiteLink>,
        select?: string[],
    ) {
        return this.repo.getListBtch(cmdCode, filter, select);
    }

    register(cmdCode: string, fields: IBXRequisiteLinkRegisterFields) {
        return this.repo.registerBtch(cmdCode, fields);
    }

    unregister(cmdCode: string, data: IBXRequisiteLinkGetRequest) {
        return this.repo.unregisterBtch(cmdCode, data);
    }
}
