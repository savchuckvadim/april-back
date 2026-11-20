import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { DealMovementDealsReader } from '../services/deal-movement-deals.reader';
import { DealMovementHistoryReader } from '../services/deal-movement-history.reader';
import { CATEGORY, STAGES, TZ } from './deal-movement.fixture';

const historyRow = (id: number, ownerId: number, stageId: string) => ({
    ID: id,
    OWNER_ID: ownerId,
    STAGE_ID: stageId,
    CREATED_TIME: `2026-11-${String(10 + (id % 10)).padStart(2, '0')}T10:00:00+03:00`,
});

describe('читатель открытых сделок', () => {
    it('вся воронка «ОП Основная» курсором, только нужные поля, id воронки — через PortalModel', async () => {
        const all = jest
            .fn()
            .mockResolvedValue([
                { ID: '9041', TITLE: 'А', STAGE_ID: 'C7:PRES' },
                { ID: '' },
            ]);
        const portal = {
            getDealCategoryByCode: jest.fn().mockReturnValue(CATEGORY),
            getTimezone: () => TZ,
        };
        const reader = new DealMovementDealsReader(
            { deal: { all } } as never,
            portal as never,
        );

        const open = await reader.loadOpen();

        expect(portal.getDealCategoryByCode).toHaveBeenCalledWith(
            PbxDealCategoryCodeEnum.sales_base,
        );
        expect(all).toHaveBeenCalledWith({ CATEGORY_ID: '7', CLOSED: 'N' }, [
            'ID',
            'TITLE',
            'STAGE_ID',
            'ASSIGNED_BY_ID',
            'OPPORTUNITY',
            'MOVED_TIME',
            'LAST_ACTIVITY_TIME',
            'COMPANY_ID',
            'CONTACT_ID',
            'LEAD_ID',
            'DATE_CREATE',
        ]);
        expect(open.categoryId).toBe(7);
        expect(open.rows.map(row => row.dealId)).toEqual([9041]);
        expect(open.rows[0]?.stageCode).toBe('sales_pres');
    });

    it('воронки нет на портале — ошибка конфигурации, а не пустой счёт', async () => {
        const reader = new DealMovementDealsReader(
            { deal: { all: jest.fn() } } as never,
            {
                getDealCategoryByCode: () => undefined,
                getTimezone: () => TZ,
            } as never,
        );

        await expect(reader.loadOpen()).rejects.toThrow('ОП Основная');
    });
});

describe('читатель истории стадий', () => {
    const build = (pages: Record<string, unknown>[][]) => {
        const list = jest.fn();
        const callBatchWithConcurrency = jest.fn();
        for (const page of pages) {
            callBatchWithConcurrency.mockResolvedValueOnce([
                { result: page[0] },
            ]);
        }
        const bitrix = {
            batch: { stageHistory: { list } },
            api: { callBatchWithConcurrency },
        };
        return {
            reader: new DealMovementHistoryReader(bitrix as never, 7, STAGES),
            list,
            callBatchWithConcurrency,
        };
    };

    it('по 50 сделок на команду, курсор >ID, одна пачка на раунд одним инстансом (strict)', async () => {
        const fullPage = Array.from({ length: 50 }, (_, index) =>
            historyRow(index + 1, 1, 'C7:PRES'),
        );
        const { reader, list, callBatchWithConcurrency } = build([
            [
                {
                    movement_history_0: { items: fullPage },
                    movement_history_1: {
                        items: [historyRow(1000, 60, 'C7:COLD')],
                    },
                },
            ],
            [
                {
                    movement_history_0: {
                        items: [
                            historyRow(51, 2, 'C7:SEND'),
                            historyRow(52, 2, 'C7:REFINE'),
                        ],
                    },
                },
            ],
        ]);
        const dealIds = Array.from({ length: 60 }, (_, index) => index + 1);
        const warnings: string[] = [];

        const { transitions, dwell } = await reader.load(dealIds, warnings);

        expect(list).toHaveBeenNthCalledWith(1, 'movement_history_0', {
            entityTypeId: BitrixOwnerTypeId.DEAL,
            filter: { CATEGORY_ID: 7, OWNER_ID: dealIds.slice(0, 50) },
            order: { ID: 'ASC' },
            select: ['ID', 'OWNER_ID', 'CREATED_TIME', 'STAGE_ID'],
            start: -1,
        });
        expect(list).toHaveBeenNthCalledWith(2, 'movement_history_1', {
            entityTypeId: BitrixOwnerTypeId.DEAL,
            filter: { CATEGORY_ID: 7, OWNER_ID: dealIds.slice(50) },
            order: { ID: 'ASC' },
            select: ['ID', 'OWNER_ID', 'CREATED_TIME', 'STAGE_ID'],
            start: -1,
        });
        // Второй раунд — только незакрытая порция, со своим курсором.
        expect(list).toHaveBeenNthCalledWith(
            3,
            'movement_history_0',
            expect.objectContaining({
                filter: {
                    CATEGORY_ID: 7,
                    OWNER_ID: dealIds.slice(0, 50),
                    '>ID': 50,
                },
            }),
        );
        expect(callBatchWithConcurrency).toHaveBeenCalledTimes(2);
        expect(callBatchWithConcurrency).toHaveBeenCalledWith(1, {
            strict: true,
        });
        expect(transitions.get(2)).toEqual([
            expect.objectContaining({ fromOrder: 7, toOrder: 5 }),
        ]);
        // Из той же истории — эпизод «Отправлены» сделки 2 закрыт переходом.
        expect(dwell.get(7)).toHaveLength(1);
        expect(warnings).toEqual([]);
    });

    it('пустой список сделок — ни одного запроса', async () => {
        const { reader, callBatchWithConcurrency } = build([]);
        const empty = await reader.load([], []);
        expect(empty.transitions.size).toBe(0);
        expect(empty.dwell.size).toBe(0);
        expect(callBatchWithConcurrency).not.toHaveBeenCalled();
    });

    it('упавшая пачка — исключение: неполная история хуже отсутствующей', async () => {
        const list = jest.fn();
        const bitrix = {
            batch: { stageHistory: { list } },
            api: {
                callBatchWithConcurrency: jest
                    .fn()
                    .mockRejectedValue(new Error('Батч-чанк не выполнен')),
            },
        };
        const reader = new DealMovementHistoryReader(
            bitrix as never,
            7,
            STAGES,
        );

        await expect(reader.load([1], [])).rejects.toThrow('Батч-чанк');
    });
});
