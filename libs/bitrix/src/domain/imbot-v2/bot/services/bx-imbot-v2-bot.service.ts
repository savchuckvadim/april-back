import { BxImBotV2BotRepository } from '../repository/bx-imbot-v2-bot.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2BotRegisterRequest,
    IBXImBotV2BotUnregisterRequest,
    IBXImBotV2BotUpdateRequest,
    IBXImBotV2BotGetRequest,
    IBXImBotV2BotListRequest,
} from '../interface/bx-imbot-v2-bot.interface';

export class BxImBotV2BotService {
    clone(api: BitrixBaseApi): BxImBotV2BotService {
        const instance = new BxImBotV2BotService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2BotRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2BotRepository(api);
    }

    async register(data: IBXImBotV2BotRegisterRequest) {
        return await this.repo.register(data);
    }

    async unregister(data: IBXImBotV2BotUnregisterRequest) {
        return await this.repo.unregister(data);
    }

    async update(data: IBXImBotV2BotUpdateRequest) {
        return await this.repo.update(data);
    }

    async get(data: IBXImBotV2BotGetRequest) {
        return await this.repo.get(data);
    }

    async list(data: IBXImBotV2BotListRequest = {}) {
        return await this.repo.list(data);
    }
}
