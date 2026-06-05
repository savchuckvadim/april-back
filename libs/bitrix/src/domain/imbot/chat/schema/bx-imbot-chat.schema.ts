import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotChatAddRequest,
    IBXImBotChatAddResponse,
    IBXImBotChatGetRequest,
    IBXImBotChatGetResponse,
    IBXImBotChatLeaveRequest,
    IBXImBotChatSendTypingRequest,
    IBXImBotChatSetOwnerRequest,
    IBXImBotChatSetManagerRequest,
    IBXImBotChatUpdateTitleRequest,
    IBXImBotChatUpdateColorRequest,
    IBXImBotChatUpdateAvatarRequest,
    IBXImBotChatUserAddRequest,
    IBXImBotChatUserDeleteRequest,
    IBXImBotChatUserListRequest,
    IBXImBotChatUserListResponse,
    IBXImBotChatBoolResponse,
} from '../interface/bx-imbot-chat.interface';

export type ImBotChatSchema = {
    [EBxMethod.ADD]: {
        request: IBXImBotChatAddRequest;
        response: IBXImBotChatAddResponse;
    };
    [EBxMethod.GET]: {
        request: IBXImBotChatGetRequest;
        response: IBXImBotChatGetResponse;
    };
    [EBxMethod.LEAVE]: {
        request: IBXImBotChatLeaveRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.SEND_TYPING]: {
        request: IBXImBotChatSendTypingRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.SET_OWNER]: {
        request: IBXImBotChatSetOwnerRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.SET_MANAGER]: {
        request: IBXImBotChatSetManagerRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.UPDATE_TITLE]: {
        request: IBXImBotChatUpdateTitleRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.UPDATE_COLOR]: {
        request: IBXImBotChatUpdateColorRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.UPDATE_AVATAR]: {
        request: IBXImBotChatUpdateAvatarRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.USER_ADD]: {
        request: IBXImBotChatUserAddRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.USER_DELETE]: {
        request: IBXImBotChatUserDeleteRequest;
        response: IBXImBotChatBoolResponse;
    };
    [EBxMethod.USER_LIST]: {
        request: IBXImBotChatUserListRequest;
        response: IBXImBotChatUserListResponse;
    };
};
