import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotV2ChatAddRequest,
    IBXImBotV2ChatAddResponse,
    IBXImBotV2ChatGetRequest,
    IBXImBotV2ChatGetResponse,
    IBXImBotV2ChatLeaveRequest,
    IBXImBotV2ChatSetOwnerRequest,
    IBXImBotV2ChatUpdateRequest,
    IBXImBotV2ChatUsersRequest,
    IBXImBotV2ChatUserListRequest,
    IBXImBotV2ChatUserListResponse,
    IBXImBotV2ChatInputActionNotifyRequest,
    IBXImBotV2ChatTextFieldEnabledRequest,
    IBXImBotV2ChatBoolResponse,
} from '../interface/bx-imbot-v2-chat.interface';

export type ImBotV2ChatSchema = {
    [EBxMethod.ADD]: {
        request: IBXImBotV2ChatAddRequest;
        response: IBXImBotV2ChatAddResponse;
    };
    [EBxMethod.GET]: {
        request: IBXImBotV2ChatGetRequest;
        response: IBXImBotV2ChatGetResponse;
    };
    [EBxMethod.LEAVE]: {
        request: IBXImBotV2ChatLeaveRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.SET_OWNER]: {
        request: IBXImBotV2ChatSetOwnerRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXImBotV2ChatUpdateRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.MANAGER_ADD]: {
        request: IBXImBotV2ChatUsersRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.MANAGER_DELETE]: {
        request: IBXImBotV2ChatUsersRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.USER_ADD]: {
        request: IBXImBotV2ChatUsersRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.USER_DELETE]: {
        request: IBXImBotV2ChatUsersRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.USER_LIST]: {
        request: IBXImBotV2ChatUserListRequest;
        response: IBXImBotV2ChatUserListResponse;
    };
    [EBxMethod.INPUT_ACTION_NOTIFY]: {
        request: IBXImBotV2ChatInputActionNotifyRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
    [EBxMethod.TEXT_FIELD_ENABLED]: {
        request: IBXImBotV2ChatTextFieldEnabledRequest;
        response: IBXImBotV2ChatBoolResponse;
    };
};
