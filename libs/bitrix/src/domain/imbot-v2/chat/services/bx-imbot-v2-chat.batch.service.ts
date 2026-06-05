import { Injectable } from '@nestjs/common';
import { BxImBotV2ChatRepository } from '../repository/bx-imbot-v2-chat.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2ChatAddRequest,
    IBXImBotV2ChatUsersRequest,
} from '../interface/bx-imbot-v2-chat.interface';

@Injectable()
export class BxImBotV2ChatBatchService {
    clone(api: BitrixBaseApi): BxImBotV2ChatBatchService {
        const instance = new BxImBotV2ChatBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2ChatRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2ChatRepository(api);
    }

    add(cmdCode: string, data: IBXImBotV2ChatAddRequest) {
        return this.repo.addBtch(cmdCode, data);
    }

    userAdd(cmdCode: string, data: IBXImBotV2ChatUsersRequest) {
        return this.repo.userAddBtch(cmdCode, data);
    }
}
