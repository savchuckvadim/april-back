import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXFindByCommRequest,
    IBXFindByCommResult,
} from '../interface/bx-duplicate.interface';

export type BxDuplicateSchema = {
    [EBxMethod.FIND_BY_COMM]: {
        request: IBXFindByCommRequest;
        response: IBXFindByCommResult;
    };
};
