import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxStageHistoryRepository } from '../repository/bx-stage-history.repository';
import { BxStageHistoryService } from '../services/bx-stage-history.service';
import { BxStageHistoryBatchService } from '../services/bx-stage-history.batch.service';
import {
    IBXStageHistoryItem,
    IBXStageHistoryListRequest,
} from '../interface/bx-stage-history.interface';

/**
 * Формирование запроса crm.stagehistory.list: строка метода собирается
 * ядром из CRM + 'stagehistory' + 'list', параметры — только документированные
 * (entityTypeId, filter, order, select, start).
 */
function makeItems(fromId: number, count: number): IBXStageHistoryItem[] {
    return Array.from({ length: count }, (_, i) => ({
        ID: fromId + i,
        TYPE_ID: 2,
        OWNER_ID: 100 + i,
        CREATED_TIME: '2026-09-01T10:00:00+03:00',
        CATEGORY_ID: 0,
        STAGE_SEMANTIC_ID: 'P',
        STAGE_ID: 'NEW',
    }));
}

function page(items: IBXStageHistoryItem[]) {
    return { result: { items } };
}

function requestArgOf(mock: jest.Mock, callIndex: number, argIndex: number) {
    const call = mock.mock.calls[callIndex] as unknown[];
    return call[argIndex] as IBXStageHistoryListRequest;
}

describe('BxStageHistoryRepository', () => {
    let repo: BxStageHistoryRepository;
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let api: BitrixBaseApi;

    beforeEach(() => {
        callType = jest.fn();
        addCmdBatchType = jest.fn();
        api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxStageHistoryRepository(api);
    });

    it('list: вызывает crm.stagehistory.list с документированными параметрами как есть', async () => {
        callType.mockResolvedValueOnce(page(makeItems(1, 2)));
        const request: IBXStageHistoryListRequest = {
            entityTypeId: 2,
            filter: { OWNER_ID: 21, '>=CREATED_TIME': '2026-09-01' },
            order: { ID: 'ASC' },
            select: ['ID', 'STAGE_ID', 'CREATED_TIME'],
            start: 50,
        };

        const response = await repo.list(request);

        expect(callType).toHaveBeenCalledTimes(1);
        expect(callType).toHaveBeenCalledWith(
            'crm',
            'stagehistory',
            'list',
            request,
        );
        expect(response.result.items).toHaveLength(2);
    });

    it('listBtch: кладёт ту же команду в batch-очередь под ключом cmd', () => {
        const request: IBXStageHistoryListRequest = {
            entityTypeId: 1,
            filter: { OWNER_ID: [1, 2, 3] },
        };

        repo.listBtch('history_lead_1', request);

        expect(addCmdBatchType).toHaveBeenCalledWith(
            'history_lead_1',
            'crm',
            'stagehistory',
            'list',
            request,
        );
        expect(callType).not.toHaveBeenCalled();
    });

    it('listAll: листает по 50 курсором >ID, order ID ASC, start -1', async () => {
        callType
            .mockResolvedValueOnce(page(makeItems(1, 50)))
            .mockResolvedValueOnce(page(makeItems(51, 10)));

        const items = await repo.listAll({
            entityTypeId: 2,
            filter: { CATEGORY_ID: 4 },
        });

        expect(items).toHaveLength(60);
        expect(callType).toHaveBeenCalledTimes(2);
        const first = requestArgOf(callType, 0, 3);
        const second = requestArgOf(callType, 1, 3);
        expect(first).toEqual({
            entityTypeId: 2,
            filter: { CATEGORY_ID: 4 },
            select: undefined,
            order: { ID: 'ASC' },
            start: -1,
        });
        expect(second.filter).toEqual({ CATEGORY_ID: 4, '>ID': 50 });
        expect(second.order).toEqual({ ID: 'ASC' });
        expect(second.start).toBe(-1);
    });

    it('listAll: в select без ID добавляет ID (курсору нужен идентификатор)', async () => {
        callType.mockResolvedValueOnce(page(makeItems(1, 3)));

        await repo.listAll({
            entityTypeId: 2,
            select: ['STAGE_ID', 'CREATED_TIME'],
        });

        expect(requestArgOf(callType, 0, 3).select).toEqual([
            'ID',
            'STAGE_ID',
            'CREATED_TIME',
        ]);
    });

    it('listAll: пустой ответ — пустой массив, один запрос', async () => {
        callType.mockResolvedValueOnce(page([]));

        const items = await repo.listAll({ entityTypeId: 2 });

        expect(items).toEqual([]);
        expect(callType).toHaveBeenCalledTimes(1);
    });

    it('listAll: полная страница без ID в ответе не зацикливается', async () => {
        const withoutIds = makeItems(1, 50).map(item => ({
            ...item,
            ID: Number.NaN,
        }));
        callType.mockResolvedValue(page(withoutIds));

        const items = await repo.listAll({ entityTypeId: 2 });

        expect(items).toHaveLength(50);
        expect(callType).toHaveBeenCalledTimes(1);
    });

    it('сервис и batch-сервис клонируются под инстанс api и делегируют репозиторию', async () => {
        callType.mockResolvedValueOnce(page(makeItems(1, 1)));
        const service = new BxStageHistoryService().clone(api);
        const batchService = new BxStageHistoryBatchService().clone(api);
        const request: IBXStageHistoryListRequest = { entityTypeId: 2 };

        await service.list(request);
        batchService.list('cmd_1', request);

        expect(callType).toHaveBeenCalledWith(
            'crm',
            'stagehistory',
            'list',
            request,
        );
        expect(addCmdBatchType).toHaveBeenCalledWith(
            'cmd_1',
            'crm',
            'stagehistory',
            'list',
            request,
        );
    });
});
