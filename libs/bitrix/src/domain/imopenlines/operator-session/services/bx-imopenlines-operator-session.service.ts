import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImOpenlinesOperatorSessionRepository } from '../repository/bx-imopenlines-operator-session.repository';
import { IBXImOpenlinesSessionJoinRequest } from '../interface/bx-imopenlines-operator-session.interface';

export class BxImOpenlinesOperatorSessionService {
    private repo: BxImOpenlinesOperatorSessionRepository;

    clone(api: BitrixBaseApi): BxImOpenlinesOperatorSessionService {
        const instance = new BxImOpenlinesOperatorSessionService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImOpenlinesOperatorSessionRepository(api);
    }

    async join(data: IBXImOpenlinesSessionJoinRequest) {
        return await this.repo.join(data);
    }
}
