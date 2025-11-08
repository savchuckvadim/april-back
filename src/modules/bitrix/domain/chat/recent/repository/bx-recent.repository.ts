import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXRecentListRequest } from '../interface/bx-recent.interface';

export class BxRecentRepository {
    constructor(private readonly bxApi: BitrixBaseApi) { }

    async getList(params?: IBXRecentListRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.RECENT,
            EBxMethod.LIST,
            params || {},
        );
    }

    getListBtch(cmdCode: string, params?: IBXRecentListRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IM,
            EBXEntity.RECENT,
            EBxMethod.LIST,
            params || {},
        );
    }
}

