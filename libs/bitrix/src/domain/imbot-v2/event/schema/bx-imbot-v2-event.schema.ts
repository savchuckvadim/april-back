import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotV2EventGetRequest,
    IBXImBotV2EventGetResponse,
} from '../interface/bx-imbot-v2-event.interface';

export type ImBotV2EventSchema = {
    [EBxMethod.GET]: {
        request: IBXImBotV2EventGetRequest;
        response: IBXImBotV2EventGetResponse;
    };
};
