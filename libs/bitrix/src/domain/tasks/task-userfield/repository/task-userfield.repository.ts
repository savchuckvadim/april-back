import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    ITaskUserField,
    ITaskUserFieldListFilter,
    ITaskUserFieldListOrder,
    ITaskUserFieldParams,
} from '../interface/task-userfield.interface';

/**
 * Репозиторий пользовательских полей задачи (task.item.userfield.*).
 *
 * Эти методы не входят в типизированную BXApiSchema, поэтому используем
 * generic-вызовы `call` / `addCmdBatch` с явными строками методов
 * (по аналогии с `commentAddBtch` в task.repository.ts).
 */
const METHOD = {
    GET_LIST: 'task.item.userfield.getlist',
    ADD: 'task.item.userfield.add',
    UPDATE: 'task.item.userfield.update',
    DELETE: 'task.item.userfield.delete',
} as const;

export interface ITaskUserFieldListResponse {
    result: ITaskUserField[];
    total?: number;
}

export class BxTaskUserFieldRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    /**
     * Список пользовательских полей задач.
     */
    async getList(
        order?: ITaskUserFieldListOrder,
        filter?: ITaskUserFieldListFilter,
    ): Promise<ITaskUserFieldListResponse> {
        const response = await this.bxApi.call(METHOD.GET_LIST, {
            ORDER: order,
            FILTER: filter,
        });
        return response as ITaskUserFieldListResponse;
    }

    /**
     * Создаёт пользовательское поле задачи.
     */
    async add(params: ITaskUserFieldParams): Promise<unknown> {
        return this.bxApi.call(METHOD.ADD, { PARAMS: params });
    }

    /**
     * Обновляет пользовательское поле задачи.
     */
    async update(
        id: number | string,
        params: ITaskUserFieldParams,
    ): Promise<unknown> {
        return this.bxApi.call(METHOD.UPDATE, { ID: id, PARAMS: params });
    }

    /**
     * Удаляет пользовательское поле задачи.
     */
    async delete(id: number | string): Promise<unknown> {
        return this.bxApi.call(METHOD.DELETE, { ID: id });
    }

    /** Создаёт поле задачи (batch). */
    addBtch(cmdCode: string, params: ITaskUserFieldParams) {
        return this.bxApi.addCmdBatch(cmdCode, METHOD.ADD, { PARAMS: params });
    }

    /** Обновляет поле задачи (batch). */
    updateBtch(
        cmdCode: string,
        id: number | string,
        params: ITaskUserFieldParams,
    ) {
        return this.bxApi.addCmdBatch(cmdCode, METHOD.UPDATE, {
            ID: id,
            PARAMS: params,
        });
    }

    /** Удаляет поле задачи (batch). */
    deleteBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatch(cmdCode, METHOD.DELETE, { ID: id });
    }
}
