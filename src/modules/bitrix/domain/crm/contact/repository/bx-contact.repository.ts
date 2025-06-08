import { BitrixBaseApi } from "src/modules/bitrix/core";
import { EBxMethod, EBxNamespace } from "../../../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../../../core/domain/consts/bitrix-entities.enum";
import { IBXContact } from "../interface/bx-contact.interface";

export class BxContactRepository {
    constructor(
        private readonly bxApi: BitrixBaseApi
    ) { }

    async get(contactId: number) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: contactId }
        );
    }

    async getBtch(cmdCode: string, contactId: number) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: contactId }
        );
    }

    async getList(filter: Partial<IBXContact>, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: filter.ID || 0 }
        );
    }

    async getListBtch(cmdCode: string, filter: Partial<IBXContact>, select?: string[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: filter.ID || 0 }
        );
    }

    async set(data: Partial<IBXContact>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.ADD,
            { fields: data }
        );
    }

    async setBtch(cmdCode: string, data: Partial<IBXContact>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.ADD,
            { fields: data }
        );
    }

    async update(id: number | string, data: Partial<IBXContact>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.UPDATE,
            { id: id, fields: data }
        );
    }

    async updateBtch(cmdCode: string, id: number | string, data: Partial<IBXContact>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.UPDATE,
            { id, fields: data }
        );
    }

    async getFieldList(filter: { [key: string]: any }, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: filter.ID || 0 }
        );
    }

    async getField(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: id }
        );
    }

    async getFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.CONTACT,
            EBxMethod.GET,
            { ID: id }
        );
    }
} 