import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImV2EventRepository } from '../repository/bx-im-v2-event.repository';
import {
    IBXImV2EventGetRequest,
    IBXImV2EventSubscribeRequest,
} from '../interface/bx-im-v2-event.interface';

export class BxImV2EventService {
    private repo: BxImV2EventRepository;

    clone(api: BitrixBaseApi): BxImV2EventService {
        const instance = new BxImV2EventService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImV2EventRepository(api);
    }

    async subscribe(data: IBXImV2EventSubscribeRequest = {}) {
        return await this.repo.subscribe(data);
    }

    async get(data: IBXImV2EventGetRequest) {
        return await this.repo.get(data);
    }
}
