import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXRequisite } from '../interface/bx-requisite.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxRequisiteRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(id: number, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.GET,
            { ID: id, select },
        );
    }

    getBtch(cmdCode: string, id: number | string, select?: string[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.GET,
            { ID: id, select: select ?? ['ID'] },
        );
    }

    async getList(
        filter: Partial<IBXRequisite>,
        select?: string[],
        order?: {
            [key in keyof IBXRequisite]?: 'asc' | 'desc' | 'ASC' | 'DESC';
        },
    ) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.LIST,
            { select, filter, order, start: -1 },
        );
    }

    getListBtch(
        cmdCode: string,
        filter: Partial<IBXRequisite>,
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.LIST,
            { select, filter, start: -1 },
        );
    }

    async add(data: Partial<IBXRequisite>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    addBtch(cmdCode: string, data: Partial<IBXRequisite>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    async update(id: number | string, data: Partial<IBXRequisite>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.UPDATE,
            { id, fields: data },
        );
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        data: Partial<IBXRequisite>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.UPDATE,
            { id, fields: data },
        );
    }

    async delete(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.DELETE,
            { id },
        );
    }

    deleteBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.DELETE,
            { id },
        );
    }

    async getFieldList(filter: { [key: string]: any }, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_LIST,
            { select, filter },
        );
    }

    getFieldListBtch(
        cmdCode: string,
        filter: { [key: string]: any },
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_LIST,
            { select, filter },
        );
    }

    async getField(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_GET,
            { id },
        );
    }

    getFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_GET,
            { id },
        );
    }

    async addField(fields: Partial<IBXField>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    addFieldBtch(cmdCode: string, fields: Partial<IBXField>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    async updateField(id: number | string, fields: Partial<IBXField>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_UPDATE,
            { id, fields },
        );
    }

    updateFieldBtch(
        cmdCode: string,
        id: number | string,
        fields: Partial<IBXField>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_UPDATE,
            { id, fields },
        );
    }

    async deleteField(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }

    deleteFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }
}
