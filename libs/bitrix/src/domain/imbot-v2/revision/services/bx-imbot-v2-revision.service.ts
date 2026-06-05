import { BxImBotV2RevisionRepository } from '../repository/bx-imbot-v2-revision.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXImBotV2RevisionGetRequest } from '../interface/bx-imbot-v2-revision.interface';

export class BxImBotV2RevisionService {
    clone(api: BitrixBaseApi): BxImBotV2RevisionService {
        const instance = new BxImBotV2RevisionService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2RevisionRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2RevisionRepository(api);
    }

    async get(data: IBXImBotV2RevisionGetRequest = {}) {
        return await this.repo.get(data);
    }
}
