import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotV2BotRegisterRequest,
    IBXImBotV2BotUnregisterRequest,
    IBXImBotV2BotUpdateRequest,
    IBXImBotV2BotGetRequest,
    IBXImBotV2BotListRequest,
} from '../interface/bx-imbot-v2-bot.interface';

const NS = EBxNamespace.IMBOT_V2;
const ENTITY = EBXEntity.BOT_V2;

export class BxImBotV2BotRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async register(data: IBXImBotV2BotRegisterRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.REGISTER, data);
    }

    async unregister(data: IBXImBotV2BotUnregisterRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.UNREGISTER,
            data,
        );
    }

    async update(data: IBXImBotV2BotUpdateRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.UPDATE, data);
    }

    async get(data: IBXImBotV2BotGetRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.GET, data);
    }

    async list(data: IBXImBotV2BotListRequest = {}) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.LIST, data);
    }

    registerBtch(cmdCode: string, data: IBXImBotV2BotRegisterRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.REGISTER,
            data,
        );
    }

    listBtch(cmdCode: string, data: IBXImBotV2BotListRequest = {}) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.LIST,
            data,
        );
    }
}
