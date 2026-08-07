import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXMergeBatchRequest,
    IBXMergeBatchResult,
} from '../interface/bx-crm-entity.interface';

export type BxCrmEntitySchema = {
    [EBxMethod.MERGE_BATCH]: {
        request: IBXMergeBatchRequest;
        response: IBXMergeBatchResult;
    };
};
