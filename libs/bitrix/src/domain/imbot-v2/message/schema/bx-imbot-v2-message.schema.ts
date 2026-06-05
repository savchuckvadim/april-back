import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotV2MessageSendRequest,
    IBXImBotV2MessageSendResponse,
    IBXImBotV2MessageUpdateRequest,
    IBXImBotV2MessageDeleteRequest,
    IBXImBotV2MessageGetRequest,
    IBXImBotV2MessageGetResponse,
    IBXImBotV2MessageGetContextRequest,
    IBXImBotV2MessageReadRequest,
    IBXImBotV2MessageReactionRequest,
    IBXImBotV2MessageBoolResponse,
} from '../interface/bx-imbot-v2-message.interface';

export type ImBotV2MessageSchema = {
    [EBxMethod.SEND]: {
        request: IBXImBotV2MessageSendRequest;
        response: IBXImBotV2MessageSendResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXImBotV2MessageUpdateRequest;
        response: IBXImBotV2MessageBoolResponse;
    };
    [EBxMethod.DELETE]: {
        request: IBXImBotV2MessageDeleteRequest;
        response: IBXImBotV2MessageBoolResponse;
    };
    [EBxMethod.GET]: {
        request: IBXImBotV2MessageGetRequest;
        response: IBXImBotV2MessageGetResponse;
    };
    [EBxMethod.GET_CONTEXT]: {
        request: IBXImBotV2MessageGetContextRequest;
        response: IBXImBotV2MessageGetResponse;
    };
    [EBxMethod.READ]: {
        request: IBXImBotV2MessageReadRequest;
        response: IBXImBotV2MessageBoolResponse;
    };
    [EBxMethod.REACTION_ADD]: {
        request: IBXImBotV2MessageReactionRequest;
        response: IBXImBotV2MessageBoolResponse;
    };
    [EBxMethod.REACTION_DELETE]: {
        request: IBXImBotV2MessageReactionRequest;
        response: IBXImBotV2MessageBoolResponse;
    };
};
