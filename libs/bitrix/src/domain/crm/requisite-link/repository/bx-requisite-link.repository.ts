import {
    BitrixBaseApi,
    EBxNamespace,
    EBXEntity,
    EBxMethod,
} from 'src/modules/bitrix/core';
import {
    IBXRequisiteLink,
    IBXRequisiteLinkGetRequest,
    IBXRequisiteLinkRegisterFields,
} from '../interface/bx-requisite-link.interface';

export class BxRequisiteLinkRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(data: IBXRequisiteLinkGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: IBXRequisiteLinkGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.GET,
            data,
        );
    }

    async getList(filter: Partial<IBXRequisiteLink>, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.LIST,
            { filter, select, start: -1 },
        );
    }

    getListBtch(
        cmdCode: string,
        filter: Partial<IBXRequisiteLink>,
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.LIST,
            { filter, select, start: -1 },
        );
    }

    async register(fields: IBXRequisiteLinkRegisterFields) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.REGISTER,
            { fields },
        );
    }

    registerBtch(cmdCode: string, fields: IBXRequisiteLinkRegisterFields) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.REGISTER,
            { fields },
        );
    }

    async unregister(data: IBXRequisiteLinkGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.UNREGISTER,
            data,
        );
    }

    unregisterBtch(cmdCode: string, data: IBXRequisiteLinkGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_LINK,
            EBxMethod.UNREGISTER,
            data,
        );
    }
}
