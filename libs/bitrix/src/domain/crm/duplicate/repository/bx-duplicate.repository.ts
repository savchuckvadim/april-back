import {
    BitrixBaseApi,
    EBxNamespace,
    EBXEntity,
    EBxMethod,
} from 'src/modules/bitrix/core';
import { IBXFindByCommRequest } from '../interface/bx-duplicate.interface';

export class BxDuplicateRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async findByComm(data: IBXFindByCommRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.DUPLICATE,
            EBxMethod.FIND_BY_COMM,
            data,
        );
    }

    findByCommBtch(cmdCode: string, data: IBXFindByCommRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DUPLICATE,
            EBxMethod.FIND_BY_COMM,
            data,
        );
    }
}
