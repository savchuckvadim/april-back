import { BxMessageRepository } from '../repository/bx-message.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXMessageAddRequest } from '../interface/bx-message.interface';

export class BxMessageService {
    clone(api: BitrixBaseApi): BxMessageService {
        const instance = new BxMessageService();
        instance.init(api);
        return instance;
    }

    private repo: BxMessageRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxMessageRepository(api);
    }

    async add(data: IBXMessageAddRequest) {
        return await this.repo.add(data);
    }
}

