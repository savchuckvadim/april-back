import { Injectable } from '@nestjs/common';
import { BxImBotV2MessageRepository } from '../repository/bx-imbot-v2-message.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2MessageSendRequest,
    IBXImBotV2MessageUpdateRequest,
} from '../interface/bx-imbot-v2-message.interface';

@Injectable()
export class BxImBotV2MessageBatchService {
    clone(api: BitrixBaseApi): BxImBotV2MessageBatchService {
        const instance = new BxImBotV2MessageBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2MessageRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2MessageRepository(api);
    }

    send(cmdCode: string, data: IBXImBotV2MessageSendRequest) {
        return this.repo.sendBtch(cmdCode, data);
    }

    update(cmdCode: string, data: IBXImBotV2MessageUpdateRequest) {
        return this.repo.updateBtch(cmdCode, data);
    }
}
