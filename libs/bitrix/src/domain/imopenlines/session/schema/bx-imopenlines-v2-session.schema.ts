import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImOpenlinesV2SessionListRequest,
    IBXImOpenlinesV2SessionListResponse,
} from '../interface/bx-imopenlines-v2-session.interface';

export type ImOpenlinesV2SessionSchema = {
    [EBxMethod.LIST]: {
        request: IBXImOpenlinesV2SessionListRequest;
        response: IBXImOpenlinesV2SessionListResponse;
    };
};
