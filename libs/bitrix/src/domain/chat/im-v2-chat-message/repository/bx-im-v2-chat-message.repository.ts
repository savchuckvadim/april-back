import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImV2ChatMessageTailRequest } from '../interface/bx-im-v2-chat-message.interface';

const NS = EBxNamespace.IMV2;
const ENTITY = EBXEntity.CHAT_MESSAGE_V2;

/** im.v2.Chat.Message.* — чтение сообщений чата от имени пользователя ключа. */
export class BxImV2ChatMessageRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async tail(data: IBXImV2ChatMessageTailRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.TAIL, data);
    }

    tailBtch(cmdCode: string, data: IBXImV2ChatMessageTailRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.TAIL,
            data,
        );
    }
}
