import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImV2ChatMessageRepository } from '../repository/bx-im-v2-chat-message.repository';
import { IBXImV2ChatMessageTailRequest } from '../interface/bx-im-v2-chat-message.interface';

export class BxImV2ChatMessageService {
    private repo: BxImV2ChatMessageRepository;

    clone(api: BitrixBaseApi): BxImV2ChatMessageService {
        const instance = new BxImV2ChatMessageService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImV2ChatMessageRepository(api);
    }

    async tail(data: IBXImV2ChatMessageTailRequest) {
        return await this.repo.tail(data);
    }
}
