export interface IBXActivityTodoAddRequest {
    ownerTypeId: number;
    ownerId: number;
    deadline: string;
    title?: string;
    description?: string;
    responsibleId?: number;
    parentActivityId?: number;
    pingOffsets?: number[];
    colorId?: string | number;
}

export interface IBXActivityTodoAddResponse {
    result: {
        id: number;
    };
}

export interface IBXActivityTodoUpdateRequest
    extends IBXActivityTodoAddRequest {
    id: number;
}

export type IBXActivityTodoUpdateResponse = IBXActivityTodoAddResponse;

export interface IBXActivityTodoUpdateColorRequest {
    id: number;
    ownerTypeId: number;
    ownerId: number;
    colorId: number;
}

export type IBXActivityTodoUpdateColorResponse = IBXActivityTodoAddResponse;

export interface IBXActivityTodoUpdateDeadlineRequest {
    id: number;
    ownerTypeId: number;
    ownerId: number;
    value: string;
}

export type IBXActivityTodoUpdateDeadlineResponse = IBXActivityTodoAddResponse;

export interface IBXActivityTodoUpdateDescriptionRequest {
    id: number;
    ownerTypeId: number;
    ownerId: number;
    value: string;
}

export type IBXActivityTodoUpdateDescriptionResponse =
    IBXActivityTodoAddResponse;

export interface IBXActivityTodoUpdateResponsibleUserRequest {
    id: number;
    ownerTypeId: number;
    ownerId: number;
    responsibleId: number;
}

export type IBXActivityTodoUpdateResponsibleUserResponse =
    IBXActivityTodoAddResponse;
