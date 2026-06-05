import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotV2RevisionGetRequest,
    IBXImBotV2RevisionGetResponse,
} from '../interface/bx-imbot-v2-revision.interface';

export type ImBotV2RevisionSchema = {
    [EBxMethod.GET]: {
        request: IBXImBotV2RevisionGetRequest;
        response: IBXImBotV2RevisionGetResponse;
    };
};
