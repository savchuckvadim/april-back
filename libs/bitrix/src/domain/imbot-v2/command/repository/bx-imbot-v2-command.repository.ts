import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotV2CommandRegisterRequest,
    IBXImBotV2CommandUnregisterRequest,
    IBXImBotV2CommandUpdateRequest,
    IBXImBotV2CommandAnswerRequest,
    IBXImBotV2CommandListRequest,
} from '../interface/bx-imbot-v2-command.interface';

const NS = EBxNamespace.IMBOT_V2;
const ENTITY = EBXEntity.COMMAND_V2;

export class BxImBotV2CommandRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async register(data: IBXImBotV2CommandRegisterRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.REGISTER, data);
    }

    async unregister(data: IBXImBotV2CommandUnregisterRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.UNREGISTER,
            data,
        );
    }

    async update(data: IBXImBotV2CommandUpdateRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.UPDATE, data);
    }

    async answer(data: IBXImBotV2CommandAnswerRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.ANSWER, data);
    }

    async list(data: IBXImBotV2CommandListRequest = {}) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.LIST, data);
    }

    registerBtch(cmdCode: string, data: IBXImBotV2CommandRegisterRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.REGISTER,
            data,
        );
    }

    answerBtch(cmdCode: string, data: IBXImBotV2CommandAnswerRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.ANSWER,
            data,
        );
    }
}
