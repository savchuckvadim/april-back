import { BxImBotV2EventRepository } from '../repository/bx-imbot-v2-event.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXImBotV2EventGetRequest } from '../interface/bx-imbot-v2-event.interface';

export class BxImBotV2EventService {
    clone(api: BitrixBaseApi): BxImBotV2EventService {
        const instance = new BxImBotV2EventService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2EventRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2EventRepository(api);
    }

    async get(data: IBXImBotV2EventGetRequest) {
        return await this.repo.get(data);
    }
}
