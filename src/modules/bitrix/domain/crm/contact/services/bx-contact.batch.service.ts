import { BxContactRepository } from "../repository/bx-contact.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXContact } from "../interface/bx-contact.interface";


export class BxContactBatchService {
    private repo: BxContactRepository

    clone(api: BitrixBaseApi): BxContactBatchService {
        const instance = new BxContactBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxContactRepository(api);
    }

    get(cmdCode: string, contactId: number) {
        return this.repo.getBtch(cmdCode, contactId);
    }

    getList(cmdCode: string, filter: Partial<IBXContact>, select?: string[]) {
        return this.repo.getListBtch(cmdCode, filter, select);
    }

    set(cmdCode: string, data: Partial<IBXContact>  ) {
        return this.repo.setBtch(cmdCode, data);
    }

    update(cmdCode: string, contactId: number | string, data: Partial<IBXContact>) {
        return this.repo.updateBtch(cmdCode, contactId, data);
    }

    getField(cmdCode: string, id: number | string) {
        return this.repo.getFieldBtch(cmdCode, id);
    }
} 