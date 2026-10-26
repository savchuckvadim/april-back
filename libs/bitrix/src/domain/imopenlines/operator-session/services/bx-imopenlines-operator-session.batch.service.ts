import { Injectable } from '@nestjs/common';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImOpenlinesOperatorSessionRepository } from '../repository/bx-imopenlines-operator-session.repository';
import { IBXImOpenlinesSessionJoinRequest } from '../interface/bx-imopenlines-operator-session.interface';

@Injectable()
export class BxImOpenlinesOperatorSessionBatchService {
    private repo: BxImOpenlinesOperatorSessionRepository;

    clone(api: BitrixBaseApi): BxImOpenlinesOperatorSessionBatchService {
        const instance = new BxImOpenlinesOperatorSessionBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImOpenlinesOperatorSessionRepository(api);
    }

    join(cmdCode: string, data: IBXImOpenlinesSessionJoinRequest) {
        return this.repo.joinBtch(cmdCode, data);
    }
}
