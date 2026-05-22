import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBxRpaType } from '../interface/bx-rpa-type.interface';

export class BxRpaTypeRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(fields: Partial<IBxRpaType>) {
        return await this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.ADD,
            { fields },
        );
    }

    addBtch(cmdCode: string, fields: Partial<IBxRpaType>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.ADD,
            { fields },
        );
    }

    async get(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.GET,
            { id },
        );
    }

    getBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.GET,
            { id },
        );
    }

    async getList() {
        return await this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.LIST,
            {},
        );
    }

    getListBtch(cmdCode: string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.LIST,
            {},
        );
    }

    async update(id: number | string, fields: Partial<IBxRpaType>) {
        return await this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.UPDATE,
            { id, fields },
        );
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        fields: Partial<IBxRpaType>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.UPDATE,
            { id, fields },
        );
    }

    async delete(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.DELETE,
            { id },
        );
    }

    deleteBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.TYPE,
            EBxMethod.DELETE,
            { id },
        );
    }
}
