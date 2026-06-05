import { BxImOpenlinesBotSessionRepository } from '../repository/bx-imopenlines-bot-session.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImOpenlinesSessionFinishRequest,
    IBXImOpenlinesSessionTransferRequest,
    IBXImOpenlinesSessionOperatorRequest,
    IBXImOpenlinesSessionMessageSendRequest,
} from '../interface/bx-imopenlines-bot-session.interface';

export class BxImOpenlinesBotSessionService {
    clone(api: BitrixBaseApi): BxImOpenlinesBotSessionService {
        const instance = new BxImOpenlinesBotSessionService();
        instance.init(api);
        return instance;
    }

    private repo: BxImOpenlinesBotSessionRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImOpenlinesBotSessionRepository(api);
    }

    async finish(data: IBXImOpenlinesSessionFinishRequest) {
        return await this.repo.finish(data);
    }

    async transfer(data: IBXImOpenlinesSessionTransferRequest) {
        return await this.repo.transfer(data);
    }

    async operator(data: IBXImOpenlinesSessionOperatorRequest) {
        return await this.repo.operator(data);
    }

    async messageSend(data: IBXImOpenlinesSessionMessageSendRequest) {
        return await this.repo.messageSend(data);
    }
}
