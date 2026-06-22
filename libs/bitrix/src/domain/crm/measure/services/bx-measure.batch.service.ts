import { BxMeasureRepository } from '../repository/bx-measure.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBxMeasure } from '../interface/bx-measure.interface';

export class BxMeasureBatchService {
    private repo: BxMeasureRepository;

    clone(api: BitrixBaseApi): BxMeasureBatchService {
        const instance = new BxMeasureBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxMeasureRepository(api);
    }

    getList(cmdCode: string) {
        return this.repo.getListBtch(cmdCode);
    }

    get(cmdCode: string, id: number | string) {
        return this.repo.getBtch(cmdCode, id);
    }

    add(cmdCode: string, fields: Partial<IBxMeasure>) {
        return this.repo.addBtch(cmdCode, fields);
    }

    update(cmdCode: string, id: number | string, fields: Partial<IBxMeasure>) {
        return this.repo.updateBtch(cmdCode, id, fields);
    }

    delete(cmdCode: string, id: number | string) {
        return this.repo.deleteBtch(cmdCode, id);
    }
}
