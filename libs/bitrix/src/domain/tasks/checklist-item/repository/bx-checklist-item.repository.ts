import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from 'src/modules/bitrix/core/domain/consts/bitrix-api.enum';
import { EBXEntity } from 'src/modules/bitrix/core/domain/consts/bitrix-entities.enum';
import {
    IBXChecklistItemAddRequest,
    IBXChecklistItemCompleteRequest,
    IBXChecklistItemDeleteRequest,
    IBXChecklistItemGetRequest,
    IBXChecklistItemUpdateRequest,
} from '../interface/bx-checklist-item.interface';

export class BxChecklistItemRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(data: IBXChecklistItemAddRequest) {
        return await this.bxApi.callType(
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.ADD,
            data,
        );
    }

    addBtch(cmdCode: string, data: IBXChecklistItemAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.ADD,
            data,
        );
    }

    async get(data: IBXChecklistItemGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: IBXChecklistItemGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.GET,
            data,
        );
    }

    async update(data: IBXChecklistItemUpdateRequest) {
        return await this.bxApi.callType(
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.UPDATE,
            data,
        );
    }

    updateBtch(cmdCode: string, data: IBXChecklistItemUpdateRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.UPDATE,
            data,
        );
    }

    async delete(data: IBXChecklistItemDeleteRequest) {
        return await this.bxApi.callType(
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.DELETE,
            data,
        );
    }

    deleteBtch(cmdCode: string, data: IBXChecklistItemDeleteRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.DELETE,
            data,
        );
    }

    async complete(data: IBXChecklistItemCompleteRequest) {
        return await this.bxApi.callType(
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.COMPLETE,
            data,
        );
    }

    completeBtch(cmdCode: string, data: IBXChecklistItemCompleteRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASK,
            EBXEntity.CHECKLIST_ITEM,
            EBxMethod.COMPLETE,
            data,
        );
    }
}
