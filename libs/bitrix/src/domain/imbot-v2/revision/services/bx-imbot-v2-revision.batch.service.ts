import { Injectable } from '@nestjs/common';
import { BxImBotV2RevisionRepository } from '../repository/bx-imbot-v2-revision.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXImBotV2RevisionGetRequest } from '../interface/bx-imbot-v2-revision.interface';

@Injectable()
export class BxImBotV2RevisionBatchService {
    clone(api: BitrixBaseApi): BxImBotV2RevisionBatchService {
        const instance = new BxImBotV2RevisionBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2RevisionRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2RevisionRepository(api);
    }

    get(cmdCode: string, data: IBXImBotV2RevisionGetRequest = {}) {
        return this.repo.getBtch(cmdCode, data);
    }
}
