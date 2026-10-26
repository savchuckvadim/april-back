import { Injectable } from '@nestjs/common';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImV2ChatMessageRepository } from '../repository/bx-im-v2-chat-message.repository';
import { IBXImV2ChatMessageTailRequest } from '../interface/bx-im-v2-chat-message.interface';

@Injectable()
export class BxImV2ChatMessageBatchService {
    private repo: BxImV2ChatMessageRepository;

    clone(api: BitrixBaseApi): BxImV2ChatMessageBatchService {
        const instance = new BxImV2ChatMessageBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImV2ChatMessageRepository(api);
    }

    tail(cmdCode: string, data: IBXImV2ChatMessageTailRequest) {
        return this.repo.tailBtch(cmdCode, data);
    }
}
