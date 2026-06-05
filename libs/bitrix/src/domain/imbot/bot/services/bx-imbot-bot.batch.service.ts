import { Injectable } from '@nestjs/common';
import { BxImBotRepository } from '../repository/bx-imbot-bot.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotRegisterRequest,
    IBXImBotListRequest,
} from '../interface/bx-imbot-bot.interface';

@Injectable()
export class BxImBotBatchService {
    clone(api: BitrixBaseApi): BxImBotBatchService {
        const instance = new BxImBotBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotRepository(api);
    }

    register(cmdCode: string, data: IBXImBotRegisterRequest) {
        return this.repo.registerBtch(cmdCode, data);
    }

    list(cmdCode: string, data: IBXImBotListRequest = {}) {
        return this.repo.listBtch(cmdCode, data);
    }
}
