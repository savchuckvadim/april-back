import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    BxStageHistoryListAllRequest,
    BxStageHistoryRepository,
} from '../repository/bx-stage-history.repository';
import { IBXStageHistoryListRequest } from '../interface/bx-stage-history.interface';

/** crm.stagehistory.list — история стадий лидов/сделок/счетов/смарт-процессов. */
export class BxStageHistoryService {
    private repo: BxStageHistoryRepository;

    clone(api: BitrixBaseApi): BxStageHistoryService {
        const instance = new BxStageHistoryService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxStageHistoryRepository(api);
    }

    /** Одна страница (до 50 записей); следующая — start = next из ответа. */
    async list(data: IBXStageHistoryListRequest) {
        return await this.repo.list(data);
    }

    /** Вся история по фильтру (автопагинация курсором по ID). */
    async listAll(data: BxStageHistoryListAllRequest) {
        return await this.repo.listAll(data);
    }
}
