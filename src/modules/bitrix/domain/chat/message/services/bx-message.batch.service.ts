import { Injectable } from '@nestjs/common';
import { BxMessageRepository } from '../repository/bx-message.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXMessageAddRequest } from '../interface/bx-message.interface';

@Injectable()
export class BxMessageBatchService {
    clone(api: BitrixBaseApi): BxMessageBatchService {
        const instance = new BxMessageBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxMessageRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxMessageRepository(api);
    }

    add(cmdCode: string, data: IBXMessageAddRequest) {
        return this.repo.addBtch(cmdCode, data);
    }
}

