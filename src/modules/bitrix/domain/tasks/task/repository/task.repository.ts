import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { EBxMethod, EBxNamespace } from 'src/modules/bitrix/core';
import { EBXEntity } from 'src/modules/bitrix/core/domain/consts/bitrix-entities.enum';
import { ITaskFilter, ITaskCreateFields, ITaskUpdateFields } from '../interface/task.interface';
import { IBXTask } from '../../../interfaces/bitrix.interface';

export class BxTaskRepository {
    constructor(private readonly bxApi: BitrixBaseApi) { }

    /**
     * Создает задачу
     */
    async add(fields: ITaskCreateFields) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.ADD,
            { fields },
        );
    }

    /**
     * Создает задачу (batch)
     */
    addBtch(cmdCode: string, fields: ITaskCreateFields) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.ADD,
            { fields },
        );
    }

    /**
     * Получает задачу по ID
     */
    async get(taskId: number | string, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.GET,
            { taskId, select },
        );
    }

    /**
     * Получает задачу по ID (batch)
     */
    getBtch(cmdCode: string, taskId: number | string, select?: string[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.GET,
            { taskId, select },
        );
    }

    /**
     * Получает список задач
     */
    async getList(
        filter?: ITaskFilter,
        select?: string[],
        order?: { [key in keyof IBXTask]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
        start?: number,
    ) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.LIST,
            { filter, select, order, start },
        );
    }

    /**
     * Получает список задач (batch)
     */
    getListBtch(
        cmdCode: string,
        filter?: ITaskFilter,
        select?: string[],
        order?: { [key in keyof IBXTask]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
        start?: number,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.LIST,
            { filter, select, order, start },
        );
    }

    /**
     * Обновляет задачу
     */
    async update(taskId: number | string, fields: ITaskUpdateFields) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.UPDATE,
            { taskId, fields },
        );
    }

    /**
     * Обновляет задачу (batch)
     */
    updateBtch(cmdCode: string, taskId: number | string, fields: ITaskUpdateFields) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.UPDATE,
            { taskId, fields },
        );
    }

    /**
     * Удаляет задачу
     */
    async delete(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DELETE,
            { taskId },
        );
    }

    /**
     * Удаляет задачу (batch)
     */
    deleteBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DELETE,
            { taskId },
        );
    }

    /**
     * Прикрепляет файлы к задаче
     */
    async filesAttach(taskId: number | string, files: number[]) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.FILES_ATTACH,
            { taskId, files },
        );
    }

    /**
     * Прикрепляет файлы к задаче (batch)
     */
    filesAttachBtch(cmdCode: string, taskId: number | string, files: number[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.FILES_ATTACH,
            { taskId, files },
        );
    }

    /**
     * Делегирует задачу
     */
    async delegate(taskId: number | string, userId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DELEGATE,
            { taskId, userId },
        );
    }

    /**
     * Делегирует задачу (batch)
     */
    delegateBtch(cmdCode: string, taskId: number | string, userId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DELEGATE,
            { taskId, userId },
        );
    }

    /**
     * Получает счетчики пользователя
     */
    async countersGet(userId?: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.COUNTERS_GET,
            { userId },
        );
    }

    /**
     * Начинает выполнение задачи
     */
    async start(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.START,
            { taskId },
        );
    }

    /**
     * Начинает выполнение задачи (batch)
     */
    startBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.START,
            { taskId },
        );
    }

    /**
     * Приостанавливает задачу
     */
    async pause(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.PAUSE,
            { taskId },
        );
    }

    /**
     * Приостанавливает задачу (batch)
     */
    pauseBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.PAUSE,
            { taskId },
        );
    }

    /**
     * Откладывает задачу
     */
    async defer(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DEFER,
            { taskId },
        );
    }

    /**
     * Откладывает задачу (batch)
     */
    deferBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DEFER,
            { taskId },
        );
    }

    /**
     * Завершает задачу
     */
    async complete(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.COMPLETE,
            { taskId },
        );
    }

    /**
     * Завершает задачу (batch)
     */
    completeBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.COMPLETE,
            { taskId },
        );
    }

    /**
     * Возобновляет задачу
     */
    async renew(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.RENEW,
            { taskId },
        );
    }

    /**
     * Возобновляет задачу (batch)
     */
    renewBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.RENEW,
            { taskId },
        );
    }

    /**
     * Одобряет задачу
     */
    async approve(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.APPROVE,
            { taskId },
        );
    }

    /**
     * Одобряет задачу (batch)
     */
    approveBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.APPROVE,
            { taskId },
        );
    }

    /**
     * Отклоняет задачу
     */
    async disapprove(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DISAPPROVE,
            { taskId },
        );
    }

    /**
     * Отклоняет задачу (batch)
     */
    disapproveBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DISAPPROVE,
            { taskId },
        );
    }

    /**
     * Начинает наблюдение за задачей
     */
    async startWatch(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.STARTWATCH,
            { taskId },
        );
    }

    /**
     * Начинает наблюдение за задачей (batch)
     */
    startWatchBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.STARTWATCH,
            { taskId },
        );
    }

    /**
     * Прекращает наблюдение за задачей
     */
    async stopWatch(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.STOPWATCH,
            { taskId },
        );
    }

    /**
     * Прекращает наблюдение за задачей (batch)
     */
    stopWatchBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.STOPWATCH,
            { taskId },
        );
    }

    /**
     * Добавляет задачу в избранное
     */
    async favoriteAdd(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.FAVORITE_ADD,
            { taskId },
        );
    }

    /**
     * Добавляет задачу в избранное (batch)
     */
    favoriteAddBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.FAVORITE_ADD,
            { taskId },
        );
    }

    /**
     * Удаляет задачу из избранного
     */
    async favoriteRemove(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.FAVORITE_REMOVE,
            { taskId },
        );
    }

    /**
     * Удаляет задачу из избранного (batch)
     */
    favoriteRemoveBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.FAVORITE_REMOVE,
            { taskId },
        );
    }

    /**
     * Получает доступные поля задачи
     */
    async getFields() {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.GET_FIELDS,
            {},
        );
    }

    /**
     * Проверяет доступ к задаче
     */
    async getAccess(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.GET_ACCESS,
            { taskId },
        );
    }

    /**
     * Получает историю задачи
     */
    async historyList(taskId: number | string, start?: number) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.HISTORY_LIST,
            { taskId, start },
        );
    }

    /**
     * Включает режим "Тихий" для задачи
     */
    async mute(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.MUTE,
            { taskId },
        );
    }

    /**
     * Включает режим "Тихий" для задачи (batch)
     */
    muteBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.MUTE,
            { taskId },
        );
    }

    /**
     * Выключает режим "Тихий" для задачи
     */
    async unmute(taskId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.UNMUTE,
            { taskId },
        );
    }

    /**
     * Выключает режим "Тихий" для задачи (batch)
     */
    unmuteBtch(cmdCode: string, taskId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.UNMUTE,
            { taskId },
        );
    }
}
