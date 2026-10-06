import { BxTaskRepository } from '../repository/task.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    ITaskFilter,
    IBXTaskCreateFields,
    ITaskUpdateFields,
    IBXTask,
} from '../interface/task.interface';

/** Размер страницы tasks.task.list. */
const TASKS_PAGE_SIZE = 50;

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
    async add(fields: IBXTaskCreateFields) {
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
     * Все задачи по фильтру.
     *
     * Без своего порядка — курсором по ID (`>ID`, по возрастанию,
     * `start: -1`): Битрикс не считает общее число на каждой странице, а на
     * портале с десятками тысяч задач подсчёт в разы дороже самой выборки.
     * Со своим порядком — сдвигом `start` до первой неполной страницы.
     *
     * Раньше конец списка определялся по `result.total`, которого в ответе
     * нет (total лежит уровнем выше), — и каждый обход заканчивался лишним
     * запросом пустой страницы.
     */
    async getAll(
        filter?: ITaskFilter,
        select?: string[],
        order?: { [key in keyof IBXTask]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ): Promise<{ tasks: IBXTask[]; total: number }> {
        const tasks = order
            ? await this.getAllByOffset(filter, select, order)
            : await this.getAllByCursor(filter, select);
        return { tasks, total: tasks.length };
    }

    private async getAllByCursor(
        filter?: ITaskFilter,
        select?: string[],
    ): Promise<IBXTask[]> {
        const tasks: IBXTask[] = [];
        // Курсору нужен ID в каждой задаче.
        const cursorSelect = select?.length
            ? [...new Set(['ID', ...select])]
            : select;
        let lastId = 0;
        for (;;) {
            const result = await this.repo.getList(
                { ...(filter ?? {}), ...(lastId ? { '>ID': lastId } : {}) },
                cursorSelect,
                { id: 'asc' },
                -1,
            );
            const page = result.result?.tasks ?? [];
            tasks.push(...page);
            const maxId = page.reduce(
                (max, task) => Math.max(max, Number(task.id) || 0),
                lastId,
            );
            // Неполная страница — последняя. ID не вырос — курсор не
            // сработал: дальше пошёл бы круг по той же странице.
            if (page.length < TASKS_PAGE_SIZE || maxId <= lastId) break;
            lastId = maxId;
        }
        return tasks;
    }

    private async getAllByOffset(
        filter: ITaskFilter | undefined,
        select: string[] | undefined,
        order: { [key in keyof IBXTask]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ): Promise<IBXTask[]> {
        const tasks: IBXTask[] = [];
        for (let start = 0; ; start += TASKS_PAGE_SIZE) {
            const result = await this.repo.getList(
                filter,
                select,
                order,
                start,
            );
            const page = result.result?.tasks ?? [];
            tasks.push(...page);
            if (page.length < TASKS_PAGE_SIZE) break;
        }
        return tasks;
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

    /** Прикрепляет один файл Диска к задаче (tasks.task.files.attach). */
    async fileAttach(taskId: number | string, fileId: number) {
        return this.repo.fileAttach(taskId, fileId);
    }

    /** Прикрепляет файлы к задаче — по одному вызову на файл. */
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
