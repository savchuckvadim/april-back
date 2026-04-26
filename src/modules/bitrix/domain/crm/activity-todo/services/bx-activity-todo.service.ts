import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXActivityTodoAddRequest,
    IBXActivityTodoUpdateColorRequest,
    IBXActivityTodoUpdateDeadlineRequest,
    IBXActivityTodoUpdateDescriptionRequest,
    IBXActivityTodoUpdateRequest,
    IBXActivityTodoUpdateResponsibleUserRequest,
} from '../interface/bx-activity-todo.interface';
import { BxActivityTodoRepository } from '../repository/bx-activity-todo.repository';

export class BxActivityTodoService {
    private repo: BxActivityTodoRepository;

    clone(api: BitrixBaseApi): BxActivityTodoService {
        const instance = new BxActivityTodoService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxActivityTodoRepository(api);
    }

    async add(data: IBXActivityTodoAddRequest) {
        return await this.repo.add(data);
    }

    async update(data: IBXActivityTodoUpdateRequest) {
        return await this.repo.update(data);
    }

    async updateColor(data: IBXActivityTodoUpdateColorRequest) {
        return await this.repo.updateColor(data);
    }

    async updateDeadline(data: IBXActivityTodoUpdateDeadlineRequest) {
        return await this.repo.updateDeadline(data);
    }

    async updateDescription(data: IBXActivityTodoUpdateDescriptionRequest) {
        return await this.repo.updateDescription(data);
    }

    async updateResponsibleUser(
        data: IBXActivityTodoUpdateResponsibleUserRequest,
    ) {
        return await this.repo.updateResponsibleUser(data);
    }
}
