import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotMessageAddRequest,
    IBXImBotMessageAddResponse,
    IBXImBotMessageUpdateRequest,
    IBXImBotMessageUpdateResponse,
    IBXImBotMessageDeleteRequest,
    IBXImBotMessageDeleteResponse,
    IBXImBotMessageLikeRequest,
    IBXImBotMessageLikeResponse,
} from '../interface/bx-imbot-message.interface';

export type ImBotMessageSchema = {
    [EBxMethod.ADD]: {
        request: IBXImBotMessageAddRequest;
        response: IBXImBotMessageAddResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXImBotMessageUpdateRequest;
        response: IBXImBotMessageUpdateResponse;
    };
    [EBxMethod.DELETE]: {
        request: IBXImBotMessageDeleteRequest;
        response: IBXImBotMessageDeleteResponse;
    };
    [EBxMethod.LIKE]: {
        request: IBXImBotMessageLikeRequest;
        response: IBXImBotMessageLikeResponse;
    };
};
