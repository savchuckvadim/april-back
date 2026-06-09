import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXRequisitePreset } from '../interface/bx-requisite-preset.interface';

export class BxRequisitePresetRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(id: number | string, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.GET,
            { id, select },
        );
    }

    getBtch(cmdCode: string, id: number | string, select?: string[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.GET,
            { id, select: select ?? ['ID'] },
        );
    }

    async getList(
        filter: Partial<IBXRequisitePreset>,
        select?: string[],
        order?: {
            [key in keyof IBXRequisitePreset]?: 'asc' | 'desc' | 'ASC' | 'DESC';
        },
    ) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.LIST,
            { select, filter, order, start: -1 },
        );
    }

    getListBtch(
        cmdCode: string,
        filter: Partial<IBXRequisitePreset>,
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.LIST,
            { select, filter, start: -1 },
        );
    }

    async add(data: Partial<IBXRequisitePreset>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    addBtch(cmdCode: string, data: Partial<IBXRequisitePreset>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    async update(id: number | string, data: Partial<IBXRequisitePreset>) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.UPDATE,
            { id, fields: data },
        );
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        data: Partial<IBXRequisitePreset>,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.UPDATE,
            { id, fields: data },
        );
    }

    async delete(id: number | string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.DELETE,
            { id },
        );
    }

    deleteBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.DELETE,
            { id },
        );
    }

    async getCountries() {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.REQUISITE_PRESET,
            EBxMethod.COUNTRIES,
            {},
        );
    }
}
