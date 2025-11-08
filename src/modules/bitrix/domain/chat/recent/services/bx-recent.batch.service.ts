import { Injectable } from '@nestjs/common';
import { BxRecentRepository } from '../repository/bx-recent.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXRecentListRequest } from '../interface/bx-recent.interface';

@Injectable()
export class BxRecentBatchService {
    clone(api: BitrixBaseApi): BxRecentBatchService {
        const instance = new BxRecentBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxRecentRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxRecentRepository(api);
    }

    getList(cmdCode: string, params?: IBXRecentListRequest) {
        return this.repo.getListBtch(cmdCode, params);
    }
}

