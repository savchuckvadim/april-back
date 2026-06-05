import { Injectable } from '@nestjs/common';
import { BxImBotV2BotRepository } from '../repository/bx-imbot-v2-bot.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2BotRegisterRequest,
    IBXImBotV2BotListRequest,
} from '../interface/bx-imbot-v2-bot.interface';

@Injectable()
export class BxImBotV2BotBatchService {
    clone(api: BitrixBaseApi): BxImBotV2BotBatchService {
        const instance = new BxImBotV2BotBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2BotRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2BotRepository(api);
    }

    register(cmdCode: string, data: IBXImBotV2BotRegisterRequest) {
        return this.repo.registerBtch(cmdCode, data);
    }

    list(cmdCode: string, data: IBXImBotV2BotListRequest = {}) {
        return this.repo.listBtch(cmdCode, data);
    }
}
