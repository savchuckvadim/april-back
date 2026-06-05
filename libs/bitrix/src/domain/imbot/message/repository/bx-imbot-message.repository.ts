import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotMessageAddRequest,
    IBXImBotMessageUpdateRequest,
    IBXImBotMessageDeleteRequest,
    IBXImBotMessageLikeRequest,
} from '../interface/bx-imbot-message.interface';

export class BxImBotMessageRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(data: IBXImBotMessageAddRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.ADD,
            data,
        );
    }

    async update(data: IBXImBotMessageUpdateRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.UPDATE,
            data,
        );
    }

    async delete(data: IBXImBotMessageDeleteRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.DELETE,
            data,
        );
    }

    async like(data: IBXImBotMessageLikeRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.LIKE,
            data,
        );
    }

    addBtch(cmdCode: string, data: IBXImBotMessageAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.ADD,
            data,
        );
    }

    updateBtch(cmdCode: string, data: IBXImBotMessageUpdateRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.UPDATE,
            data,
        );
    }

    deleteBtch(cmdCode: string, data: IBXImBotMessageDeleteRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.DELETE,
            data,
        );
    }

    likeBtch(cmdCode: string, data: IBXImBotMessageLikeRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.MESSAGE,
            EBxMethod.LIKE,
            data,
        );
    }
}
