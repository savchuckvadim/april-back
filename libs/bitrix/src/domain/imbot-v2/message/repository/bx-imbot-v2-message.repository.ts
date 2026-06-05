import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotV2MessageSendRequest,
    IBXImBotV2MessageUpdateRequest,
    IBXImBotV2MessageDeleteRequest,
    IBXImBotV2MessageGetRequest,
    IBXImBotV2MessageGetContextRequest,
    IBXImBotV2MessageReadRequest,
    IBXImBotV2MessageReactionRequest,
} from '../interface/bx-imbot-v2-message.interface';

const NS = EBxNamespace.IMBOT_V2;
const ENTITY = EBXEntity.CHAT_MESSAGE_V2;

export class BxImBotV2MessageRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async send(data: IBXImBotV2MessageSendRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.SEND, data);
    }

    async update(data: IBXImBotV2MessageUpdateRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.UPDATE, data);
    }

    async delete(data: IBXImBotV2MessageDeleteRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.DELETE, data);
    }

    async get(data: IBXImBotV2MessageGetRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.GET, data);
    }

    async getContext(data: IBXImBotV2MessageGetContextRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.GET_CONTEXT,
            data,
        );
    }

    async read(data: IBXImBotV2MessageReadRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.READ, data);
    }

    async reactionAdd(data: IBXImBotV2MessageReactionRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.REACTION_ADD,
            data,
        );
    }

    async reactionDelete(data: IBXImBotV2MessageReactionRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.REACTION_DELETE,
            data,
        );
    }

    sendBtch(cmdCode: string, data: IBXImBotV2MessageSendRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.SEND,
            data,
        );
    }

    updateBtch(cmdCode: string, data: IBXImBotV2MessageUpdateRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.UPDATE,
            data,
        );
    }
}
