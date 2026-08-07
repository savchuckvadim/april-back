import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxDuplicateRepository } from '../repository/bx-duplicate.repository';
import { IBXFindByCommRequest } from '../interface/bx-duplicate.interface';

/** crm.duplicate.findbycomm — поиск сущностей по телефону/email. */
export class BxDuplicateService {
    private repo: BxDuplicateRepository;

    clone(api: BitrixBaseApi): BxDuplicateService {
        const instance = new BxDuplicateService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDuplicateRepository(api);
    }

    async findByComm(data: IBXFindByCommRequest) {
        return await this.repo.findByComm(data);
    }
}
