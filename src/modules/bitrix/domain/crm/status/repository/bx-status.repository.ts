import { BitrixBaseApi } from 'src/modules/bitrix/core';
import { EBxMethod, EBxNamespace, EBXEntity } from 'src/modules/bitrix/';
import { IBXStatus } from '../interface/bx-status.interface';
import {
    StatusEntityItemsRequestDto,
    StatusEntityItemsResponseDto,
    StatusEntityTypesResponseDto,
} from '../dto/status-entity.dto';

export class BxStatusRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async getList(filter: Partial<IBXStatus>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.LIST,
            { filter },
        );
    }

    getListBtch(cmdCode: string, filter: Partial<IBXStatus>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.LIST,
            { filter },
        );
    }

    async get(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.GET,
            { id },
        );
    }

    getBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.GET,
            { id },
        );
    }

    async add(fields: Partial<IBXStatus>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.ADD,
            { fields },
        );
    }

    addBtch(cmdCode: string, fields: Partial<IBXStatus>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.ADD,
            { fields },
        );
    }

    async update(id: number | string, fields: Partial<IBXStatus>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.UPDATE,
            { id, fields },
        );
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        fields: Partial<IBXStatus>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.UPDATE,
            { id, fields },
        );
    }

    async delete(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.DELETE,
            { id },
        );
    }

    deleteBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.DELETE,
            { id },
        );
    }

    async getEntityItems(
        dto: StatusEntityItemsRequestDto,
    ): Promise<StatusEntityItemsResponseDto> {
        return this.bxApi.call('crm.status.entity.items', {
            entityId: dto.entityId,
        });
    }

    async getEntityTypes(): Promise<StatusEntityTypesResponseDto> {
        return this.bxApi.call('crm.status.entity.types', {});
    }
}
