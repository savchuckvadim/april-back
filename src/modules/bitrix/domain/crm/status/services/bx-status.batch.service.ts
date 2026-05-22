import { BxStatusRepository } from '../repository/bx-status.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXStatus } from '../interface/bx-status.interface';

export class BxStatusBatchService {
    private repo: BxStatusRepository;

    clone(api: BitrixBaseApi): BxStatusBatchService {
        const instance = new BxStatusBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxStatusRepository(api);
    }

    getList(cmdCode: string, filter: Partial<IBXStatus>) {
        return this.repo.getListBtch(cmdCode, filter);
    }

    get(cmdCode: string, id: number | string) {
        return this.repo.getBtch(cmdCode, id);
    }

    add(cmdCode: string, fields: Partial<IBXStatus>) {
        return this.repo.addBtch(cmdCode, fields);
    }

    update(cmdCode: string, id: number | string, fields: Partial<IBXStatus>) {
        return this.repo.updateBtch(cmdCode, id, fields);
    }

    delete(cmdCode: string, id: number | string) {
        return this.repo.deleteBtch(cmdCode, id);
    }
}
