import { Injectable } from '@nestjs/common';
import { BxImBotChatRepository } from '../repository/bx-imbot-chat.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotChatAddRequest,
    IBXImBotChatSendTypingRequest,
    IBXImBotChatUserAddRequest,
    IBXImBotChatUserDeleteRequest,
} from '../interface/bx-imbot-chat.interface';

@Injectable()
export class BxImBotChatBatchService {
    clone(api: BitrixBaseApi): BxImBotChatBatchService {
        const instance = new BxImBotChatBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotChatRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotChatRepository(api);
    }

    add(cmdCode: string, data: IBXImBotChatAddRequest) {
        return this.repo.addBtch(cmdCode, data);
    }

    sendTyping(cmdCode: string, data: IBXImBotChatSendTypingRequest) {
        return this.repo.sendTypingBtch(cmdCode, data);
    }

    userAdd(cmdCode: string, data: IBXImBotChatUserAddRequest) {
        return this.repo.userAddBtch(cmdCode, data);
    }

    userDelete(cmdCode: string, data: IBXImBotChatUserDeleteRequest) {
        return this.repo.userDeleteBtch(cmdCode, data);
    }
}
