import { BxRecentRepository } from '../repository/bx-recent.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXRecentListRequest } from '../interface/bx-recent.interface';

export class BxRecentService {
    clone(api: BitrixBaseApi): BxRecentService {
        const instance = new BxRecentService();
        instance.init(api);
        return instance;
    }

    private repo: BxRecentRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxRecentRepository(api);
    }

    async getList(params?: IBXRecentListRequest) {
        return await this.repo.getList(params);
    }
}

