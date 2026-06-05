import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotCommandRegisterRequest,
    IBXImBotCommandUnregisterRequest,
    IBXImBotCommandUpdateRequest,
    IBXImBotCommandAnswerRequest,
} from '../interface/bx-imbot-command.interface';

export class BxImBotCommandRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async register(data: IBXImBotCommandRegisterRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.COMMAND,
            EBxMethod.REGISTER,
            data,
        );
    }

    async unregister(data: IBXImBotCommandUnregisterRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.COMMAND,
            EBxMethod.UNREGISTER,
            data,
        );
    }

    async update(data: IBXImBotCommandUpdateRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.COMMAND,
            EBxMethod.UPDATE,
            data,
        );
    }

    async answer(data: IBXImBotCommandAnswerRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.COMMAND,
            EBxMethod.ANSWER,
            data,
        );
    }

    registerBtch(cmdCode: string, data: IBXImBotCommandRegisterRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.COMMAND,
            EBxMethod.REGISTER,
            data,
        );
    }

    answerBtch(cmdCode: string, data: IBXImBotCommandAnswerRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.COMMAND,
            EBxMethod.ANSWER,
            data,
        );
    }
}
