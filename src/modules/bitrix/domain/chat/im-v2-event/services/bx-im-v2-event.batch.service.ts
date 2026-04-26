import { Injectable } from '@nestjs/common';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImV2EventRepository } from '../repository/bx-im-v2-event.repository';
import {
    IBXImV2EventGetRequest,
    IBXImV2EventSubscribeRequest,
} from '../interface/bx-im-v2-event.interface';

@Injectable()
export class BxImV2EventBatchService {
    private repo: BxImV2EventRepository;

    clone(api: BitrixBaseApi): BxImV2EventBatchService {
        const instance = new BxImV2EventBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImV2EventRepository(api);
    }

    subscribe(cmdCode: string, data: IBXImV2EventSubscribeRequest = {}) {
        return this.repo.subscribeBtch(cmdCode, data);
    }

    get(cmdCode: string, data: IBXImV2EventGetRequest) {
        return this.repo.getBtch(cmdCode, data);
    }
}
