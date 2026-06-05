import { BxImBotV2CommandRepository } from '../repository/bx-imbot-v2-command.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2CommandRegisterRequest,
    IBXImBotV2CommandUnregisterRequest,
    IBXImBotV2CommandUpdateRequest,
    IBXImBotV2CommandAnswerRequest,
    IBXImBotV2CommandListRequest,
} from '../interface/bx-imbot-v2-command.interface';

export class BxImBotV2CommandService {
    clone(api: BitrixBaseApi): BxImBotV2CommandService {
        const instance = new BxImBotV2CommandService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2CommandRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2CommandRepository(api);
    }

    async register(data: IBXImBotV2CommandRegisterRequest) {
        return await this.repo.register(data);
    }

    async unregister(data: IBXImBotV2CommandUnregisterRequest) {
        return await this.repo.unregister(data);
    }

    async update(data: IBXImBotV2CommandUpdateRequest) {
        return await this.repo.update(data);
    }

    async answer(data: IBXImBotV2CommandAnswerRequest) {
        return await this.repo.answer(data);
    }

    async list(data: IBXImBotV2CommandListRequest = {}) {
        return await this.repo.list(data);
    }
}
