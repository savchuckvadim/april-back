import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxStageHistoryRepository } from '../repository/bx-stage-history.repository';
import { IBXStageHistoryListRequest } from '../interface/bx-stage-history.interface';

/** Batch-накопление crm.stagehistory.list (одна страница на команду). */
export class BxStageHistoryBatchService {
    private repo: BxStageHistoryRepository;

    clone(api: BitrixBaseApi): BxStageHistoryBatchService {
        const instance = new BxStageHistoryBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxStageHistoryRepository(api);
    }

    list(cmd: string, data: IBXStageHistoryListRequest) {
        return this.repo.listBtch(cmd, data);
    }
}
