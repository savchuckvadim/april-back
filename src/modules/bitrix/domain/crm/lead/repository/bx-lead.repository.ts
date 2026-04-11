import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXLead } from '../interface/bx-lead.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxLeadRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(leadId: number, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.GET,
            { ID: leadId, select },
        );
    }

    getBtch(cmdCode: string, leadId: number | string, select?: string[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.GET,
            { ID: leadId, select: select ?? ['ID'] },
        );
    }

    async getList(
        filter: Partial<IBXLead>,
        select?: string[],
        order?: { [key in keyof IBXLead]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.LIST,
            { select, filter, order, start: -1 },
        );
    }

    getListBtch(
        cmdCode: string,
        filter: Partial<IBXLead>,
        select?: string[],
        order?: { [key in keyof IBXLead]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.LIST,
            { select, filter, order, start: -1 },
        );
    }

    async add(data: Partial<IBXLead>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    addBtch(cmdCode: string, data: Partial<IBXLead>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    async update(leadId: number | string, data: Partial<IBXLead>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.UPDATE,
            { id: leadId, fields: data },
        );
    }

    updateBtch(
        cmdCode: string,
        leadId: number | string,
        data: Partial<IBXLead>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.UPDATE,
            { id: leadId, fields: data },
        );
    }

    async delete(leadId: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.DELETE,
            { id: leadId },
        );
    }

    deleteBtch(cmdCode: string, leadId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.DELETE,
            { id: leadId },
        );
    }

    async getFieldList(filter: { [key: string]: any }, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
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
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_LIST,
            { select, filter },
        );
    }

    async getField(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_GET,
            {
                id,
                select: [
                    'ID',
                    'USER_TYPE_ID',
                    'FIELD_NAME',
                    'MULTIPLE',
                    'EDIT_FORM_LABEL',
                    'LIST',
                ],
            },
        );
    }

    getFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_GET,
            {
                id,
                select: [
                    'ID',
                    'USER_TYPE_ID',
                    'FIELD_NAME',
                    'MULTIPLE',
                    'EDIT_FORM_LABEL',
                    'LIST',
                ],
            },
        );
    }

    async addField(fields: Partial<IBXField>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    addFieldBtch(cmdCode: string, fields: Partial<IBXField>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    async updateField(id: number | string, fields: Partial<IBXField>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
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
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_UPDATE,
            { id, fields },
        );
    }

    async deleteField(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }

    deleteFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.LEAD,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }
}
