import { Injectable } from '@nestjs/common';
import { BxImOpenlinesBotSessionRepository } from '../repository/bx-imopenlines-bot-session.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImOpenlinesSessionTransferRequest,
    IBXImOpenlinesSessionMessageSendRequest,
} from '../interface/bx-imopenlines-bot-session.interface';

@Injectable()
export class BxImOpenlinesBotSessionBatchService {
    clone(api: BitrixBaseApi): BxImOpenlinesBotSessionBatchService {
        const instance = new BxImOpenlinesBotSessionBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImOpenlinesBotSessionRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImOpenlinesBotSessionRepository(api);
    }

    transfer(cmdCode: string, data: IBXImOpenlinesSessionTransferRequest) {
        return this.repo.transferBtch(cmdCode, data);
    }

    messageSend(
        cmdCode: string,
        data: IBXImOpenlinesSessionMessageSendRequest,
    ) {
        return this.repo.messageSendBtch(cmdCode, data);
    }
}
