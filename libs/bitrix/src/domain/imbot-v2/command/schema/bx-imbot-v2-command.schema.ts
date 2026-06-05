import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotV2CommandRegisterRequest,
    IBXImBotV2CommandRegisterResponse,
    IBXImBotV2CommandUnregisterRequest,
    IBXImBotV2CommandUpdateRequest,
    IBXImBotV2CommandAnswerRequest,
    IBXImBotV2CommandListRequest,
    IBXImBotV2CommandListResponse,
    IBXImBotV2CommandBoolResponse,
} from '../interface/bx-imbot-v2-command.interface';

export type ImBotV2CommandSchema = {
    [EBxMethod.REGISTER]: {
        request: IBXImBotV2CommandRegisterRequest;
        response: IBXImBotV2CommandRegisterResponse;
    };
    [EBxMethod.UNREGISTER]: {
        request: IBXImBotV2CommandUnregisterRequest;
        response: IBXImBotV2CommandBoolResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXImBotV2CommandUpdateRequest;
        response: IBXImBotV2CommandBoolResponse;
    };
    [EBxMethod.ANSWER]: {
        request: IBXImBotV2CommandAnswerRequest;
        response: IBXImBotV2CommandBoolResponse;
    };
    [EBxMethod.LIST]: {
        request: IBXImBotV2CommandListRequest;
        response: IBXImBotV2CommandListResponse;
    };
};
