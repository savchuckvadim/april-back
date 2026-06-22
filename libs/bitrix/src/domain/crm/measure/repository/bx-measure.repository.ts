import { BitrixBaseApi } from 'src/modules/bitrix/core';
import { EBxMethod, EBxNamespace, EBXEntity } from 'src/modules/bitrix';
import { IBxMeasure } from '../interface/bx-measure.interface';

export class BxMeasureRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async getList() {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.LIST,
            {},
        );
    }

    getListBtch(cmdCode: string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.LIST,
            {},
        );
    }

    async get(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.GET,
            { id },
        );
    }

    getBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.GET,
            { id },
        );
    }

    async add(fields: Partial<IBxMeasure>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.ADD,
            { fields },
        );
    }

    addBtch(cmdCode: string, fields: Partial<IBxMeasure>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.ADD,
            { fields },
        );
    }

    async update(id: number | string, fields: Partial<IBxMeasure>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.UPDATE,
            { id, fields },
        );
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        fields: Partial<IBxMeasure>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.UPDATE,
            { id, fields },
        );
    }

    async delete(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.DELETE,
            { id },
        );
    }

    deleteBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.MEASURE,
            EBxMethod.DELETE,
            { id },
        );
    }
}
