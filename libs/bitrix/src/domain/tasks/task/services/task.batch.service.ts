import { BxTaskRepository } from '../repository/task.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    ITaskFilter,
    IBXTaskCreateFields,
    ITaskUpdateFields,
    IBXTask,
    ITaskCommentAddFields,
} from '../interface/task.interface';

export class BxTaskBatchService {
    private repo: BxTaskRepository;

    clone(api: BitrixBaseApi): BxTaskBatchService {
        const instance = new BxTaskBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxTaskRepository(api);
    }

    /**
     * Создает задачу (batch)
     */
    add(cmdCode: string, fields: IBXTaskCreateFields) {
        return this.repo.addBtch(cmdCode, fields);
    }

    /**
     * Получает задачу по ID (batch)
     */
    get(cmdCode: string, taskId: number | string, select?: string[]) {
        return this.repo.getBtch(cmdCode, taskId, select);
    }

    /**
     * Получает список задач (batch)
     */
    getList(
        cmdCode: string,
        filter?: ITaskFilter,
        select?: string[],
        order?: { [key in keyof IBXTask]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
        start?: number,
    ) {
        return this.repo.getListBtch(cmdCode, filter, select, order, start);
    }

    /**
     * Обновляет задачу (batch)
     */
    update(
        cmdCode: string,
        taskId: number | string,
        fields: ITaskUpdateFields,
    ) {
        return this.repo.updateBtch(cmdCode, taskId, fields);
    }

    /**
     * Добавляет комментарий к задаче (batch, `task.commentitem.add`)
     */
    commentAdd(
        cmdCode: string,
        taskId: number | string,
        fields: ITaskCommentAddFields,
    ) {
        return this.repo.commentAddBtch(cmdCode, taskId, fields);
    }

    /**
     * Завершает задачу
     */
    complete(cmdCode: string, taskId: number | string) {
        return this.repo.completeBtch(cmdCode, taskId);
    }

    /**
     * Возобновляет завершённую задачу (batch, `tasks.task.renew`) — откат
     * массового закрытия.
     */
    renew(cmdCode: string, taskId: number | string) {
        return this.repo.renewBtch(cmdCode, taskId);
    }

    /**
     * Принимает работу за постановщика (batch, `tasks.task.approve`): задача
     * с контролем после complete встаёт в «Ждёт контроля», approve её
     * завершает.
     */
    approve(cmdCode: string, taskId: number | string) {
        return this.repo.approveBtch(cmdCode, taskId);
    }

    /**
     * Удаляет задачу (batch)
     */
    delete(cmdCode: string, taskId: number | string) {
        return this.repo.deleteBtch(cmdCode, taskId);
    }
}
