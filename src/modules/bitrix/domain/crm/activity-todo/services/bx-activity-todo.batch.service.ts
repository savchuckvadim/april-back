import { Injectable } from '@nestjs/common';
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

@Injectable()
export class BxActivityTodoBatchService {
    private repo: BxActivityTodoRepository;

    clone(api: BitrixBaseApi): BxActivityTodoBatchService {
        const instance = new BxActivityTodoBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxActivityTodoRepository(api);
    }

    add(cmdCode: string, data: IBXActivityTodoAddRequest) {
        return this.repo.addBtch(cmdCode, data);
    }

    update(cmdCode: string, data: IBXActivityTodoUpdateRequest) {
        return this.repo.updateBtch(cmdCode, data);
    }

    updateColor(cmdCode: string, data: IBXActivityTodoUpdateColorRequest) {
        return this.repo.updateColorBtch(cmdCode, data);
    }

    updateDeadline(
        cmdCode: string,
        data: IBXActivityTodoUpdateDeadlineRequest,
    ) {
        return this.repo.updateDeadlineBtch(cmdCode, data);
    }

    updateDescription(
        cmdCode: string,
        data: IBXActivityTodoUpdateDescriptionRequest,
    ) {
        return this.repo.updateDescriptionBtch(cmdCode, data);
    }

    updateResponsibleUser(
        cmdCode: string,
        data: IBXActivityTodoUpdateResponsibleUserRequest,
    ) {
        return this.repo.updateResponsibleUserBtch(cmdCode, data);
    }
}
