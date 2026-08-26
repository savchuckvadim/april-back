import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXChecklistItemAddRequest,
    IBXChecklistItemAddResponse,
    IBXChecklistItemCompleteRequest,
    IBXChecklistItemCompleteResponse,
    IBXChecklistItemDeleteRequest,
    IBXChecklistItemDeleteResponse,
    IBXChecklistItemGetListRequest,
    IBXChecklistItemGetListResponse,
    IBXChecklistItemGetRequest,
    IBXChecklistItemGetResponse,
    IBXChecklistItemUpdateRequest,
    IBXChecklistItemUpdateResponse,
} from '../interface/bx-checklist-item.interface';

export type ChecklistItemSchema = {
    [EBxMethod.ADD]: {
        request: IBXChecklistItemAddRequest;
        response: IBXChecklistItemAddResponse;
    };
    [EBxMethod.GET]: {
        request: IBXChecklistItemGetRequest;
        response: IBXChecklistItemGetResponse;
    };
    /** `task.checklistitem.getlist` — все пункты чек-листов задачи. */
    [EBxMethod.GET_LIST]: {
        request: IBXChecklistItemGetListRequest;
        response: IBXChecklistItemGetListResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXChecklistItemUpdateRequest;
        response: IBXChecklistItemUpdateResponse;
    };
    [EBxMethod.DELETE]: {
        request: IBXChecklistItemDeleteRequest;
        response: IBXChecklistItemDeleteResponse;
    };
    [EBxMethod.COMPLETE]: {
        request: IBXChecklistItemCompleteRequest;
        response: IBXChecklistItemCompleteResponse;
    };
};
