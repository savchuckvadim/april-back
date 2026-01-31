import { BxTaskRepository } from '../repository/task.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { ITaskFilter, ITaskCreateFields, ITaskUpdateFields } from '../interface/task.interface';
import { IBXTask } from '../../../interfaces/bitrix.interface';

export class BxTaskService {
    private repo: BxTaskRepository;

    clone(api: BitrixBaseApi): BxTaskService {
        const instance = new BxTaskService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxTaskRepository(api);
    }

    /**
     * Создает задачу
     */
    async add(fields: ITaskCreateFields) {
        return this.repo.add(fields);
    }

    /**
     * Получает задачу по ID
     */
    async get(taskId: number | string, select?: string[]) {
        return this.repo.get(taskId, select);
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
        return this.repo.getList(filter, select, order, start);
    }

    /**
     * Получает все задачи (с пагинацией)
     */
    async getAll(
        filter?: ITaskFilter,
        select?: string[],
        order?: { [key in keyof IBXTask]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ): Promise<{ tasks: IBXTask[]; total: number }> {
        const tasks: IBXTask[] = [];
        let needMore = true;
        let start = 0;

        while (needMore) {
            const result = await this.repo.getList(filter, select, order, start);
            if (result.result?.tasks && result.result.tasks.length > 0) {
                tasks.push(...result.result.tasks);
                start += result.result.tasks.length;
                if (
                    result.result.total !== undefined &&
                    tasks.length >= result.result.total
                ) {
                    needMore = false;
                }
            } else {
                needMore = false;
            }
        }

        return {
            tasks,
            total: tasks.length,
        };
    }

    /**
     * Обновляет задачу
     */
    async update(taskId: number | string, fields: ITaskUpdateFields) {
        return this.repo.update(taskId, fields);
    }

    /**
     * Удаляет задачу
     */
    async delete(taskId: number | string) {
        return this.repo.delete(taskId);
    }

    /**
     * Прикрепляет файлы к задаче
     */
    async filesAttach(taskId: number | string, files: number[]) {
        return this.repo.filesAttach(taskId, files);
    }

    /**
     * Делегирует задачу
     */
    async delegate(taskId: number | string, userId: number | string) {
        return this.repo.delegate(taskId, userId);
    }

    /**
     * Получает счетчики пользователя
     */
    async countersGet(userId?: number | string) {
        return this.repo.countersGet(userId);
    }

    /**
     * Начинает выполнение задачи
     */
    async start(taskId: number | string) {
        return this.repo.start(taskId);
    }

    /**
     * Приостанавливает задачу
     */
    async pause(taskId: number | string) {
        return this.repo.pause(taskId);
    }

    /**
     * Откладывает задачу
     */
    async defer(taskId: number | string) {
        return this.repo.defer(taskId);
    }

    /**
     * Завершает задачу
     */
    async complete(taskId: number | string) {
        return this.repo.complete(taskId);
    }

    /**
     * Возобновляет задачу
     */
    async renew(taskId: number | string) {
        return this.repo.renew(taskId);
    }

    /**
     * Одобряет задачу
     */
    async approve(taskId: number | string) {
        return this.repo.approve(taskId);
    }

    /**
     * Отклоняет задачу
     */
    async disapprove(taskId: number | string) {
        return this.repo.disapprove(taskId);
    }

    /**
     * Начинает наблюдение за задачей
     */
    async startWatch(taskId: number | string) {
        return this.repo.startWatch(taskId);
    }

    /**
     * Прекращает наблюдение за задачей
     */
    async stopWatch(taskId: number | string) {
        return this.repo.stopWatch(taskId);
    }

    /**
     * Добавляет задачу в избранное
     */
    async favoriteAdd(taskId: number | string) {
        return this.repo.favoriteAdd(taskId);
    }

    /**
     * Удаляет задачу из избранного
     */
    async favoriteRemove(taskId: number | string) {
        return this.repo.favoriteRemove(taskId);
    }

    /**
     * Получает доступные поля задачи
     */
    async getFields() {
        return this.repo.getFields();
    }

    /**
     * Проверяет доступ к задаче
     */
    async getAccess(taskId: number | string) {
        return this.repo.getAccess(taskId);
    }

    /**
     * Получает историю задачи
     */
    async historyList(taskId: number | string, start?: number) {
        return this.repo.historyList(taskId, start);
    }

    /**
     * Включает режим "Тихий" для задачи
     */
    async mute(taskId: number | string) {
        return this.repo.mute(taskId);
    }

    /**
     * Выключает режим "Тихий" для задачи
     */
    async unmute(taskId: number | string) {
        return this.repo.unmute(taskId);
    }
}
