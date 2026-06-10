import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxTaskUserFieldRepository } from '../repository/task-userfield.repository';
import { ITaskUserFieldParams } from '../interface/task-userfield.interface';

/**
 * Batch-сервис пользовательских полей задачи (task.item.userfield.*).
 */
export class BxTaskUserFieldBatchService {
    private repo: BxTaskUserFieldRepository;

    clone(api: BitrixBaseApi): BxTaskUserFieldBatchService {
        const instance = new BxTaskUserFieldBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxTaskUserFieldRepository(api);
    }

    addBtch(cmdCode: string, params: ITaskUserFieldParams) {
        return this.repo.addBtch(cmdCode, params);
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        params: ITaskUserFieldParams,
    ) {
        return this.repo.updateBtch(cmdCode, id, params);
    }

    deleteBtch(cmdCode: string, id: number | string) {
        return this.repo.deleteBtch(cmdCode, id);
    }
}
