import { Injectable } from '@nestjs/common';
import { BxImBotV2EventRepository } from '../repository/bx-imbot-v2-event.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXImBotV2EventGetRequest } from '../interface/bx-imbot-v2-event.interface';

@Injectable()
export class BxImBotV2EventBatchService {
    clone(api: BitrixBaseApi): BxImBotV2EventBatchService {
        const instance = new BxImBotV2EventBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2EventRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2EventRepository(api);
    }

    get(cmdCode: string, data: IBXImBotV2EventGetRequest) {
        return this.repo.getBtch(cmdCode, data);
    }
}
