import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    BxTaskUserFieldRepository,
    ITaskUserFieldListResponse,
} from '../repository/task-userfield.repository';
import {
    ITaskUserField,
    ITaskUserFieldListFilter,
    ITaskUserFieldListOrder,
    ITaskUserFieldParams,
} from '../interface/task-userfield.interface';

/**
 * Сервис пользовательских полей задачи (task.item.userfield.*).
 */
export class BxTaskUserFieldService {
    private repo: BxTaskUserFieldRepository;

    clone(api: BitrixBaseApi): BxTaskUserFieldService {
        const instance = new BxTaskUserFieldService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxTaskUserFieldRepository(api);
    }

    async getList(
        order?: ITaskUserFieldListOrder,
        filter?: ITaskUserFieldListFilter,
    ): Promise<ITaskUserFieldListResponse> {
        return await this.repo.getList(order, filter);
    }

    /** Возвращает только массив полей из ответа getList. */
    async getAll(filter?: ITaskUserFieldListFilter): Promise<ITaskUserField[]> {
        const { result } = await this.repo.getList({ SORT: 'ASC' }, filter);
        return result ?? [];
    }

    async add(params: ITaskUserFieldParams): Promise<unknown> {
        return await this.repo.add(params);
    }

    async update(
        id: number | string,
        params: ITaskUserFieldParams,
    ): Promise<unknown> {
        return await this.repo.update(id, params);
    }

    async delete(id: number | string): Promise<unknown> {
        return await this.repo.delete(id);
    }
}
