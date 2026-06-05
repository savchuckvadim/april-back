import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotV2BotRegisterRequest,
    IBXImBotV2BotRegisterResponse,
    IBXImBotV2BotUnregisterRequest,
    IBXImBotV2BotUpdateRequest,
    IBXImBotV2BotGetRequest,
    IBXImBotV2BotGetResponse,
    IBXImBotV2BotListRequest,
    IBXImBotV2BotListResponse,
    IBXImBotV2BotBoolResponse,
} from '../interface/bx-imbot-v2-bot.interface';

export type ImBotV2BotSchema = {
    [EBxMethod.REGISTER]: {
        request: IBXImBotV2BotRegisterRequest;
        response: IBXImBotV2BotRegisterResponse;
    };
    [EBxMethod.UNREGISTER]: {
        request: IBXImBotV2BotUnregisterRequest;
        response: IBXImBotV2BotBoolResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXImBotV2BotUpdateRequest;
        response: IBXImBotV2BotBoolResponse;
    };
    [EBxMethod.GET]: {
        request: IBXImBotV2BotGetRequest;
        response: IBXImBotV2BotGetResponse;
    };
    [EBxMethod.LIST]: {
        request: IBXImBotV2BotListRequest;
        response: IBXImBotV2BotListResponse;
    };
};
