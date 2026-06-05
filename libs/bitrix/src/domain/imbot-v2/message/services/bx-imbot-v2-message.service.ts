import { BxImBotV2MessageRepository } from '../repository/bx-imbot-v2-message.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2MessageSendRequest,
    IBXImBotV2MessageUpdateRequest,
    IBXImBotV2MessageDeleteRequest,
    IBXImBotV2MessageGetRequest,
    IBXImBotV2MessageGetContextRequest,
    IBXImBotV2MessageReadRequest,
    IBXImBotV2MessageReactionRequest,
} from '../interface/bx-imbot-v2-message.interface';

export class BxImBotV2MessageService {
    clone(api: BitrixBaseApi): BxImBotV2MessageService {
        const instance = new BxImBotV2MessageService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2MessageRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2MessageRepository(api);
    }

    async send(data: IBXImBotV2MessageSendRequest) {
        return await this.repo.send(data);
    }

    async update(data: IBXImBotV2MessageUpdateRequest) {
        return await this.repo.update(data);
    }

    async delete(data: IBXImBotV2MessageDeleteRequest) {
        return await this.repo.delete(data);
    }

    async get(data: IBXImBotV2MessageGetRequest) {
        return await this.repo.get(data);
    }

    async getContext(data: IBXImBotV2MessageGetContextRequest) {
        return await this.repo.getContext(data);
    }

    async read(data: IBXImBotV2MessageReadRequest) {
        return await this.repo.read(data);
    }

    async reactionAdd(data: IBXImBotV2MessageReactionRequest) {
        return await this.repo.reactionAdd(data);
    }

    async reactionDelete(data: IBXImBotV2MessageReactionRequest) {
        return await this.repo.reactionDelete(data);
    }
}
