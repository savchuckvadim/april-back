import { BxImBotRepository } from '../repository/bx-imbot-bot.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotRegisterRequest,
    IBXImBotUnregisterRequest,
    IBXImBotUpdateRequest,
    IBXImBotListRequest,
} from '../interface/bx-imbot-bot.interface';

export class BxImBotService {
    clone(api: BitrixBaseApi): BxImBotService {
        const instance = new BxImBotService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotRepository(api);
    }

    async register(data: IBXImBotRegisterRequest) {
        return await this.repo.register(data);
    }

    async unregister(data: IBXImBotUnregisterRequest) {
        return await this.repo.unregister(data);
    }

    async update(data: IBXImBotUpdateRequest) {
        return await this.repo.update(data);
    }

    async list(data: IBXImBotListRequest = {}) {
        return await this.repo.list(data);
    }
}
