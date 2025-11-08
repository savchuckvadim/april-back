import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXMessageAddRequest } from '../interface/bx-message.interface';

export class BxMessageRepository {
    constructor(private readonly bxApi: BitrixBaseApi) { }

    async add(data: IBXMessageAddRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.MESSAGE,
            EBxMethod.ADD,
            data,
        );
    }

    addBtch(cmdCode: string, data: IBXMessageAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IM,
            EBXEntity.MESSAGE,
            EBxMethod.ADD,
            data,
        );
    }
}

