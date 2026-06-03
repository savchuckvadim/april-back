import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXActivityTodoAddRequest,
    IBXActivityTodoAddResponse,
    IBXActivityTodoUpdateColorRequest,
    IBXActivityTodoUpdateColorResponse,
    IBXActivityTodoUpdateDeadlineRequest,
    IBXActivityTodoUpdateDeadlineResponse,
    IBXActivityTodoUpdateDescriptionRequest,
    IBXActivityTodoUpdateDescriptionResponse,
    IBXActivityTodoUpdateRequest,
    IBXActivityTodoUpdateResponsibleUserRequest,
    IBXActivityTodoUpdateResponsibleUserResponse,
    IBXActivityTodoUpdateResponse,
} from '../interface/bx-activity-todo.interface';

export type ActivityTodoSchema = {
    [EBxMethod.ADD]: {
        request: IBXActivityTodoAddRequest;
        response: IBXActivityTodoAddResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXActivityTodoUpdateRequest;
        response: IBXActivityTodoUpdateResponse;
    };
    [EBxMethod.UPDATE_COLOR]: {
        request: IBXActivityTodoUpdateColorRequest;
        response: IBXActivityTodoUpdateColorResponse;
    };
    [EBxMethod.UPDATE_DEADLINE]: {
        request: IBXActivityTodoUpdateDeadlineRequest;
        response: IBXActivityTodoUpdateDeadlineResponse;
    };
    [EBxMethod.UPDATE_DESCRIPTION]: {
        request: IBXActivityTodoUpdateDescriptionRequest;
        response: IBXActivityTodoUpdateDescriptionResponse;
    };
    [EBxMethod.UPDATE_RESPONSIBLE_USER]: {
        request: IBXActivityTodoUpdateResponsibleUserRequest;
        response: IBXActivityTodoUpdateResponsibleUserResponse;
    };
};
