import { BxTaskRepository } from '../repository/task.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { ITaskFilter, ITaskCreateFields, ITaskUpdateFields } from '../interface/task.interface';
import { IBXTask } from '../../../interfaces/bitrix.interface';

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
    add(cmdCode: string, fields: ITaskCreateFields) {
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
    update(cmdCode: string, taskId: number | string, fields: ITaskUpdateFields) {
        return this.repo.updateBtch(cmdCode, taskId, fields);
    }

    /**
     * Удаляет задачу (batch)
     */
    delete(cmdCode: string, taskId: number | string) {
        return this.repo.deleteBtch(cmdCode, taskId);
    }
}
