import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxRequisiteLinkRepository } from '../repository/bx-requisite-link.repository';
import {
    IBXRequisiteLink,
    IBXRequisiteLinkGetRequest,
    IBXRequisiteLinkRegisterFields,
} from '../interface/bx-requisite-link.interface';

/** crm.requisite.link.* — связь реквизитов со сделками/счетами/предложениями. */
export class BxRequisiteLinkService {
    private repo: BxRequisiteLinkRepository;

    clone(api: BitrixBaseApi): BxRequisiteLinkService {
        const instance = new BxRequisiteLinkService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRequisiteLinkRepository(api);
    }

    async get(data: IBXRequisiteLinkGetRequest) {
        return await this.repo.get(data);
    }

    async getList(filter: Partial<IBXRequisiteLink>, select?: string[]) {
        return await this.repo.getList(filter, select);
    }

    async register(fields: IBXRequisiteLinkRegisterFields) {
        return await this.repo.register(fields);
    }

    async unregister(data: IBXRequisiteLinkGetRequest) {
        return await this.repo.unregister(data);
    }
}
