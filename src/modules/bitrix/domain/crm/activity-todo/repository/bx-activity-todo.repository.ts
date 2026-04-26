import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXActivityTodoAddRequest,
    IBXActivityTodoUpdateColorRequest,
    IBXActivityTodoUpdateDeadlineRequest,
    IBXActivityTodoUpdateDescriptionRequest,
    IBXActivityTodoUpdateRequest,
    IBXActivityTodoUpdateResponsibleUserRequest,
} from '../interface/bx-activity-todo.interface';

export class BxActivityTodoRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(data: IBXActivityTodoAddRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.ADD,
            data,
        );
    }

    addBtch(cmdCode: string, data: IBXActivityTodoAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.ADD,
            data,
        );
    }

    async update(data: IBXActivityTodoUpdateRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE,
            data,
        );
    }

    updateBtch(cmdCode: string, data: IBXActivityTodoUpdateRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE,
            data,
        );
    }

    async updateColor(data: IBXActivityTodoUpdateColorRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_COLOR,
            data,
        );
    }

    updateColorBtch(cmdCode: string, data: IBXActivityTodoUpdateColorRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_COLOR,
            data,
        );
    }

    async updateDeadline(data: IBXActivityTodoUpdateDeadlineRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_DEADLINE,
            data,
        );
    }

    updateDeadlineBtch(
        cmdCode: string,
        data: IBXActivityTodoUpdateDeadlineRequest,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_DEADLINE,
            data,
        );
    }

    async updateDescription(data: IBXActivityTodoUpdateDescriptionRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_DESCRIPTION,
            data,
        );
    }

    updateDescriptionBtch(
        cmdCode: string,
        data: IBXActivityTodoUpdateDescriptionRequest,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_DESCRIPTION,
            data,
        );
    }

    async updateResponsibleUser(
        data: IBXActivityTodoUpdateResponsibleUserRequest,
    ) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_RESPONSIBLE_USER,
            data,
        );
    }

    updateResponsibleUserBtch(
        cmdCode: string,
        data: IBXActivityTodoUpdateResponsibleUserRequest,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY_TODO,
            EBxMethod.UPDATE_RESPONSIBLE_USER,
            data,
        );
    }
}
