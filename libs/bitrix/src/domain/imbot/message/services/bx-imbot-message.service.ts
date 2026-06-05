import { BxImBotMessageRepository } from '../repository/bx-imbot-message.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotMessageAddRequest,
    IBXImBotMessageUpdateRequest,
    IBXImBotMessageDeleteRequest,
    IBXImBotMessageLikeRequest,
} from '../interface/bx-imbot-message.interface';

export class BxImBotMessageService {
    clone(api: BitrixBaseApi): BxImBotMessageService {
        const instance = new BxImBotMessageService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotMessageRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotMessageRepository(api);
    }

    async add(data: IBXImBotMessageAddRequest) {
        return await this.repo.add(data);
    }

    async update(data: IBXImBotMessageUpdateRequest) {
        return await this.repo.update(data);
    }

    async delete(data: IBXImBotMessageDeleteRequest) {
        return await this.repo.delete(data);
    }

    async like(data: IBXImBotMessageLikeRequest) {
        return await this.repo.like(data);
    }
}
