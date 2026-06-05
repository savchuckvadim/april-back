import { Injectable } from '@nestjs/common';
import { BxImBotCommandRepository } from '../repository/bx-imbot-command.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotCommandRegisterRequest,
    IBXImBotCommandAnswerRequest,
} from '../interface/bx-imbot-command.interface';

@Injectable()
export class BxImBotCommandBatchService {
    clone(api: BitrixBaseApi): BxImBotCommandBatchService {
        const instance = new BxImBotCommandBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotCommandRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotCommandRepository(api);
    }

    register(cmdCode: string, data: IBXImBotCommandRegisterRequest) {
        return this.repo.registerBtch(cmdCode, data);
    }

    answer(cmdCode: string, data: IBXImBotCommandAnswerRequest) {
        return this.repo.answerBtch(cmdCode, data);
    }
}
