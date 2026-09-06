import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    BxStageHistoryFilter,
    IBXStageHistoryItem,
    IBXStageHistoryListRequest,
} from '../interface/bx-stage-history.interface';

/** Предел элементов на страницу списочных методов REST («не более чем по 50»). */
const STAGE_HISTORY_PAGE_SIZE = 50;

/** Параметры полной выгрузки: сортировку и смещение репозиторий задаёт сам. */
export type BxStageHistoryListAllRequest = Omit<
    IBXStageHistoryListRequest,
    'order' | 'start'
>;

export class BxStageHistoryRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    /** Одна страница истории стадий: crm.stagehistory.list. */
    async list(data: IBXStageHistoryListRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STAGE_HISTORY,
            EBxMethod.LIST,
            data,
        );
    }

    /** То же в batch-очередь инстанса (cmd — ключ команды в ответе batch). */
    listBtch(cmd: string, data: IBXStageHistoryListRequest) {
        return this.bxApi.addCmdBatchType(
            cmd,
            EBxNamespace.CRM,
            EBXEntity.STAGE_HISTORY,
            EBxMethod.LIST,
            data,
        );
    }

    /**
     * Вся история по фильтру: страницы по 50 курсором '>ID' + order ID ASC
     * + start: -1 (без подсчёта total) — тот же приём, что в
     * BxItemRepository.listAll. Курсору нужен ID в выборке — добавляется сам.
     */
    async listAll(
        data: BxStageHistoryListAllRequest,
    ): Promise<IBXStageHistoryItem[]> {
        const { entityTypeId, filter = {}, select } = data;
        const items: IBXStageHistoryItem[] = [];
        let lastId: number | undefined;
        let hasMore = true;
        while (hasMore) {
            const cursorFilter: BxStageHistoryFilter =
                lastId === undefined ? filter : { ...filter, '>ID': lastId };
            const page = await this.list({
                entityTypeId,
                filter: cursorFilter,
                select: withIdSelected(select),
                order: { ID: 'ASC' },
                start: -1,
            });
            const pageItems = page?.result?.items ?? [];
            const previousLastId = lastId;
            for (const item of pageItems) {
                items.push(item);
                const numericId = Number(item.ID);
                if (Number.isFinite(numericId)) lastId = numericId;
            }
            // Полная страница без продвижения курсора (нет ID в ответе) —
            // защита от бесконечного цикла.
            hasMore =
                pageItems.length >= STAGE_HISTORY_PAGE_SIZE &&
                lastId !== previousLastId;
        }
        return items;
    }
}

/** Курсор пагинации требует ID в выборке — добавляем, если select задан без него. */
function withIdSelected(
    select?: (keyof IBXStageHistoryItem)[],
): (keyof IBXStageHistoryItem)[] | undefined {
    if (!select) return undefined;
    return select.includes('ID') ? select : ['ID', ...select];
}
