import { EBxMethod } from '../../../../core/domain/consts/bitrix-api.enum';
import {
    IBXStageHistoryListRequest,
    IBXStageHistoryListResponse,
} from '../interface/bx-stage-history.interface';

/** crm.stagehistory.* — у метода единственная операция list. */
export type BxStageHistorySchema = {
    [EBxMethod.LIST]: {
        request: IBXStageHistoryListRequest;
        response: IBXStageHistoryListResponse;
    };
};
