import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImV2EventGetRequest,
    IBXImV2EventGetResponse,
    IBXImV2EventSubscribeRequest,
    IBXImV2EventSubscribeResponse,
} from '../interface/bx-im-v2-event.interface';

export type ImV2EventSchema = {
    [EBxMethod.SUBSCRIBE]: {
        request: IBXImV2EventSubscribeRequest;
        response: IBXImV2EventSubscribeResponse;
    };
    [EBxMethod.GET]: {
        request: IBXImV2EventGetRequest;
        response: IBXImV2EventGetResponse;
    };
};
