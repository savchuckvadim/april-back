import { BitrixBaseApi } from 'src/modules/bitrix/core';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXContact } from '../interface/bx-contact.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxContactRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(contactId: number) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: contactId },
        );
    }

    async getBtch(cmdCode: string, contactId: number) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: contactId },
        );
    }

    async getList(filter: Partial<IBXContact>, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.LIST,
            { filter, select },
        );
    }

    async getListBtch(
        cmdCode: string,
        filter: Partial<IBXContact>,
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.LIST,
            { filter, select },
        );
    }

    async set(data: Partial<IBXContact>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    async setBtch(cmdCode: string, data: Partial<IBXContact>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    async update(id: number | string, data: Partial<IBXContact>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.UPDATE,
            { id: id, fields: data },
        );
    }

    async updateBtch(
        cmdCode: string,
        id: number | string,
        data: Partial<IBXContact>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.UPDATE,
            { id, fields: data },
        );
    }

    async getFieldList(filter: { [key: string]: any }, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
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
            EBXEntity.CONTACT,
            EBxMethod.USER_FIELD_LIST,
            { select, filter },
        );
    }

    async getField(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
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

    async getFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
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
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    addFieldBtch(cmdCode: string, fields: Partial<IBXField>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    async updateField(id: number | string, fields: Partial<IBXField>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
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
            EBXEntity.CONTACT,
            EBxMethod.USER_FIELD_UPDATE,
            { id, fields },
        );
    }

    async deleteField(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }

    deleteFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }
}
