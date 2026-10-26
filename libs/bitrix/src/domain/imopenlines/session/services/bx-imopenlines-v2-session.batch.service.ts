import { Injectable } from '@nestjs/common';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImOpenlinesV2SessionRepository } from '../repository/bx-imopenlines-v2-session.repository';
import { IBXImOpenlinesV2SessionListRequest } from '../interface/bx-imopenlines-v2-session.interface';

@Injectable()
export class BxImOpenlinesV2SessionBatchService {
    private repo: BxImOpenlinesV2SessionRepository;

    clone(api: BitrixBaseApi): BxImOpenlinesV2SessionBatchService {
        const instance = new BxImOpenlinesV2SessionBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImOpenlinesV2SessionRepository(api);
    }

    list(cmdCode: string, data: IBXImOpenlinesV2SessionListRequest) {
        return this.repo.listBtch(cmdCode, data);
    }
}
