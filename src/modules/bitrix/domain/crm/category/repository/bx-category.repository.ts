import { BitrixBaseApi } from 'src/modules/bitrix/core';
import { EBxMethod, EBxNamespace, EBXEntity } from 'src/modules/bitrix/';
import { IBXCategory } from '../interface/bx-category.interface';
import { BitrixOwnerTypeId } from 'src/modules/bitrix/domain/enums/bitrix-constants.enum';

export class BxCategoryRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(id: number | string, entityTypeId: BitrixOwnerTypeId | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.GET,
            { id, entityTypeId },
        );
    }

    getBtch(
        cmdCode: string,
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.GET,
            { id, entityTypeId },
        );
    }

    async getList(entityTypeId: BitrixOwnerTypeId | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.LIST,
            { entityTypeId },
        );
    }

    getListBtch(cmdCode: string, entityTypeId: BitrixOwnerTypeId | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.LIST,
            { entityTypeId },
        );
    }

    async add(
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.ADD,
            { entityTypeId, fields },
        );
    }

    addBtch(
        cmdCode: string,
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.ADD,
            { entityTypeId, fields },
        );
    }

    async update(
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.UPDATE,
            { id, entityTypeId, fields },
        );
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.UPDATE,
            { id, entityTypeId, fields },
        );
    }

    async delete(
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
    ) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.DELETE,
            { id, entityTypeId },
        );
    }

    deleteBtch(
        cmdCode: string,
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.DELETE,
            { id, entityTypeId },
        );
    }
}
