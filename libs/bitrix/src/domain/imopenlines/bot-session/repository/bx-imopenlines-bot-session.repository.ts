import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImOpenlinesSessionFinishRequest,
    IBXImOpenlinesSessionTransferRequest,
    IBXImOpenlinesSessionOperatorRequest,
    IBXImOpenlinesSessionMessageSendRequest,
} from '../interface/bx-imopenlines-bot-session.interface';

const NS = EBxNamespace.IMOPENLINES;
const ENTITY = EBXEntity.BOT_SESSION;

export class BxImOpenlinesBotSessionRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async finish(data: IBXImOpenlinesSessionFinishRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.SESSION_FINISH,
            data,
        );
    }

    async transfer(data: IBXImOpenlinesSessionTransferRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.SESSION_TRANSFER,
            data,
        );
    }

    async operator(data: IBXImOpenlinesSessionOperatorRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.SESSION_OPERATOR,
            data,
        );
    }

    async messageSend(data: IBXImOpenlinesSessionMessageSendRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.SESSION_MESSAGE_SEND,
            data,
        );
    }

    transferBtch(cmdCode: string, data: IBXImOpenlinesSessionTransferRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.SESSION_TRANSFER,
            data,
        );
    }

    messageSendBtch(
        cmdCode: string,
        data: IBXImOpenlinesSessionMessageSendRequest,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.SESSION_MESSAGE_SEND,
            data,
        );
    }
}
