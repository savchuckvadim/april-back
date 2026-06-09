import { BxRequisitePresetRepository } from '../repository/bx-requisite-preset.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXRequisitePreset } from '../interface/bx-requisite-preset.interface';

/**
 * Batch-обёртка над пресетами реквизитов. Команды накапливаются в инстансе
 * `bitrix.batch.requisitePreset` и отправляются общим `callBatchWithConcurrency()`.
 */
export class BxRequisitePresetBatchService {
    private repo: BxRequisitePresetRepository;

    clone(api: BitrixBaseApi): BxRequisitePresetBatchService {
        const instance = new BxRequisitePresetBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRequisitePresetRepository(api);
    }

    get(cmdCode: string, id: number | string, select?: string[]) {
        return this.repo.getBtch(cmdCode, id, select);
    }

    getList(
        cmdCode: string,
        filter: Partial<IBXRequisitePreset>,
        select?: string[],
    ) {
        return this.repo.getListBtch(cmdCode, filter, select);
    }

    add(cmdCode: string, data: Partial<IBXRequisitePreset>) {
        return this.repo.addBtch(cmdCode, data);
    }

    update(
        cmdCode: string,
        id: number | string,
        data: Partial<IBXRequisitePreset>,
    ) {
        return this.repo.updateBtch(cmdCode, id, data);
    }

    delete(cmdCode: string, id: number | string) {
        return this.repo.deleteBtch(cmdCode, id);
    }
}
