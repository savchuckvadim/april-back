import { EBxMethod } from 'src/modules/bitrix/core';
import { IBXRecentListRequest, IBXRecentListResponse } from '../interface/bx-recent.interface';

export type RecentSchema = {
    [EBxMethod.LIST]: {
        request: IBXRecentListRequest;
        response: IBXRecentListResponse;
    };
};

