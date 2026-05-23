export interface IBXChecklistItemFields {
    TITLE: string;
    IS_COMPLETE?: 'Y' | 'N';
    SORT_INDEX?: number;
    COMPLETED_BY?: number | string;
}

export interface IBXChecklistItemAddRequest {
    TASKID: number | string;
    FIELDS: IBXChecklistItemFields;
}

export interface IBXChecklistItemAddResponse {
    result: number;
}

export interface IBXChecklistItemGetRequest {
    TASKID: number | string;
    ITEMID: number | string;
}

export interface IBXChecklistItem {
    ID: string;
    TITLE: string;
    IS_COMPLETE: 'Y' | 'N';
    SORT_INDEX: string;
    [key: string]: unknown;
}

export interface IBXChecklistItemGetResponse {
    result: IBXChecklistItem;
}

export interface IBXChecklistItemUpdateRequest {
    TASKID: number | string;
    ITEMID: number | string;
    FIELDS: Partial<IBXChecklistItemFields>;
}

export interface IBXChecklistItemUpdateResponse {
    result: boolean;
}

export interface IBXChecklistItemDeleteRequest {
    TASKID: number | string;
    ITEMID: number | string;
}

export interface IBXChecklistItemDeleteResponse {
    result: boolean;
}

export interface IBXChecklistItemCompleteRequest {
    TASKID: number | string;
    ITEMID: number | string;
}

export interface IBXChecklistItemCompleteResponse {
    result: boolean;
}
