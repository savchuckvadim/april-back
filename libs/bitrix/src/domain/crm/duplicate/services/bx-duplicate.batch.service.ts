import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxDuplicateRepository } from '../repository/bx-duplicate.repository';
import { IBXFindByCommRequest } from '../interface/bx-duplicate.interface';

/** Batch-вариант crm.duplicate.findbycomm — для планов поиска дублей. */
export class BxDuplicateBatchService {
    private repo: BxDuplicateRepository;

    clone(api: BitrixBaseApi): BxDuplicateBatchService {
        const instance = new BxDuplicateBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDuplicateRepository(api);
    }

    findByComm(cmdCode: string, data: IBXFindByCommRequest) {
        return this.repo.findByCommBtch(cmdCode, data);
    }
}
