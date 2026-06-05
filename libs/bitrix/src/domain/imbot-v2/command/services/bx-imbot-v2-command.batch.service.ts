import { Injectable } from '@nestjs/common';
import { BxImBotV2CommandRepository } from '../repository/bx-imbot-v2-command.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2CommandRegisterRequest,
    IBXImBotV2CommandAnswerRequest,
} from '../interface/bx-imbot-v2-command.interface';

@Injectable()
export class BxImBotV2CommandBatchService {
    clone(api: BitrixBaseApi): BxImBotV2CommandBatchService {
        const instance = new BxImBotV2CommandBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2CommandRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2CommandRepository(api);
    }

    register(cmdCode: string, data: IBXImBotV2CommandRegisterRequest) {
        return this.repo.registerBtch(cmdCode, data);
    }

    answer(cmdCode: string, data: IBXImBotV2CommandAnswerRequest) {
        return this.repo.answerBtch(cmdCode, data);
    }
}
