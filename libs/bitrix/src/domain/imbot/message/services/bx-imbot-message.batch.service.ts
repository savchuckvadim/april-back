import { Injectable } from '@nestjs/common';
import { BxImBotMessageRepository } from '../repository/bx-imbot-message.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotMessageAddRequest,
    IBXImBotMessageUpdateRequest,
    IBXImBotMessageDeleteRequest,
    IBXImBotMessageLikeRequest,
} from '../interface/bx-imbot-message.interface';

@Injectable()
export class BxImBotMessageBatchService {
    clone(api: BitrixBaseApi): BxImBotMessageBatchService {
        const instance = new BxImBotMessageBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotMessageRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotMessageRepository(api);
    }

    add(cmdCode: string, data: IBXImBotMessageAddRequest) {
        return this.repo.addBtch(cmdCode, data);
    }

    update(cmdCode: string, data: IBXImBotMessageUpdateRequest) {
        return this.repo.updateBtch(cmdCode, data);
    }

    delete(cmdCode: string, data: IBXImBotMessageDeleteRequest) {
        return this.repo.deleteBtch(cmdCode, data);
    }

    like(cmdCode: string, data: IBXImBotMessageLikeRequest) {
        return this.repo.likeBtch(cmdCode, data);
    }
}
