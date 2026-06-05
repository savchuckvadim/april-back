import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotRegisterRequest,
    IBXImBotRegisterResponse,
    IBXImBotUnregisterRequest,
    IBXImBotUnregisterResponse,
    IBXImBotUpdateRequest,
    IBXImBotUpdateResponse,
    IBXImBotListRequest,
    IBXImBotListResponse,
} from '../interface/bx-imbot-bot.interface';

// Entity-less методы (imbot.register / imbot.unregister / imbot.update)
export type ImBotLifecycleSchema = {
    [EBxMethod.REGISTER]: {
        request: IBXImBotRegisterRequest;
        response: IBXImBotRegisterResponse;
    };
    [EBxMethod.UNREGISTER]: {
        request: IBXImBotUnregisterRequest;
        response: IBXImBotUnregisterResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXImBotUpdateRequest;
        response: IBXImBotUpdateResponse;
    };
};

// imbot.bot.list
export type ImBotSchema = {
    [EBxMethod.LIST]: {
        request: IBXImBotListRequest;
        response: IBXImBotListResponse;
    };
};
