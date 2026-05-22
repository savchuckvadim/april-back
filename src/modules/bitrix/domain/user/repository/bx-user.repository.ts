import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';

import { IBXUser } from '../../interfaces/bitrix.interface';
import { IBXField } from '../../crm';
import { EBXEntity, EBxMethod, EBxNamespace } from '@/modules/bitrix/core';
import { AddRequestType, UpdateRequestType } from '../../type/request.type';

export class BxUserRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(data: Partial<IBXUser>) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.ADD,
            data,
        );
    }

    addBtch(cmdCode: string, data: Partial<IBXUser>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.ADD,
            data,
        );
    }

    async get(
        filter: Partial<IBXUser>,
        select?: string[],
        order?: { [key in keyof IBXUser]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.GET,
            { filter, select, order },
        );
    }

    getBtch(
        cmdCode: string,
        filter: Partial<IBXUser>,
        select?: string[],
        order?: { [key in keyof IBXUser]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.GET,
            { filter, select, order },
        );
    }

    async search(data: AddRequestType<IBXUser>) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.SEARCH,
            data,
        );
    }

    searchBtch(cmdCode: string, data: AddRequestType<IBXUser>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.SEARCH,
            data,
        );
    }

    async getCurrent() {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.CURRENT,
            {},
        );
    }

    getCurrentBtch(cmdCode: string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.CURRENT,
            {},
        );
    }

    async update(userId: number | string, data: UpdateRequestType<IBXUser>) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.UPDATE,
            {
                ...data,
                ID: userId,
            },
        );
    }

    updateBtch(
        cmdCode: string,
        userId: number | string,
        data: UpdateRequestType<IBXUser>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.UPDATE,
            {
                ...data,
                ID: userId,
            },
        );
    }

    async getFields() {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.FIELDS,
            undefined,
        );
    }

    getFieldsBtch(cmdCode: string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.FIELDS,
            undefined,
        );
    }

    async getUserFieldList(id: number | string, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_LIST,
            { id, select },
        );
    }

    getUserFieldListBtch(
        cmdCode: string,
        id: number | string,
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_LIST,
            { id, select },
        );
    }

    async addUserField(fields: AddRequestType<IBXField>) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    addUserFieldBtch(cmdCode: string, fields: AddRequestType<IBXField>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_ADD,
            { fields },
        );
    }

    async updateUserField(
        id: number | string,
        fields: AddRequestType<IBXField>,
    ) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_UPDATE,
            { id, fields },
        );
    }

    updateUserFieldBtch(
        cmdCode: string,
        id: number | string,
        fields: AddRequestType<IBXField>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_UPDATE,
            { id, fields },
        );
    }

    async deleteUserField(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }

    deleteUserFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.USER_FIELD_DELETE,
            { id },
        );
    }
}
