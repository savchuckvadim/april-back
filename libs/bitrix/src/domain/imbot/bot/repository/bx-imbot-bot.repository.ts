import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotRegisterRequest,
    IBXImBotUnregisterRequest,
    IBXImBotUpdateRequest,
    IBXImBotListRequest,
} from '../interface/bx-imbot-bot.interface';

export class BxImBotRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async register(data: IBXImBotRegisterRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.BOT_LIFECYCLE,
            EBxMethod.REGISTER,
            data,
        );
    }

    async unregister(data: IBXImBotUnregisterRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.BOT_LIFECYCLE,
            EBxMethod.UNREGISTER,
            data,
        );
    }

    async update(data: IBXImBotUpdateRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.BOT_LIFECYCLE,
            EBxMethod.UPDATE,
            data,
        );
    }

    async list(data: IBXImBotListRequest = {}) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.BOT,
            EBxMethod.LIST,
            data,
        );
    }

    registerBtch(cmdCode: string, data: IBXImBotRegisterRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.BOT_LIFECYCLE,
            EBxMethod.REGISTER,
            data,
        );
    }

    listBtch(cmdCode: string, data: IBXImBotListRequest = {}) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.BOT,
            EBxMethod.LIST,
            data,
        );
    }
}
