import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../cache/sales-finance-cache.service';
import { ClosedSalesJobData } from '../dto/sales-finance-job.dto';
import { ClosedSalesUseCase } from '../domain/use-cases/closed-sales.use-case';

/**
 * Юнит-тесты оркестрации use-case'а закрытых продаж:
 * месячное кэширование, forceRefresh, свежесть текущего месяца.
 * Все зависимости замоканы — сети и Redis нет.
 */

type DealAllMock = jest.Mock;

function makeBitrixMock(dealAll: DealAllMock) {
    return {
        deal: { all: dealAll },
        company: { all: jest.fn().mockResolvedValue([]) },
        batch: { productRow: { list: jest.fn() } },
        api: {
            callBatchWithConcurrency: jest
                .fn()
                .mockResolvedValue([{ result: {} }]),
        },
    };
}

function makePortalMock() {
    return {
        getDealCategoryByCode: jest.fn().mockReturnValue({
            bitrixId: '7',
            stages: [],
        }),
        getDealFieldBitrixIdByCode: jest
            .fn()
            .mockImplementation(
                (code: string) => `UF_CRM_${code.toUpperCase()}`,
            ),
    };
}

function makeCacheMock(monthCacheValue: unknown = null) {
    return {
        getJson: jest.fn().mockResolvedValue(monthCacheValue),
        setJson: jest.fn().mockResolvedValue(undefined),
    } as unknown as SalesFinanceCacheService & {
        getJson: jest.Mock;
        setJson: jest.Mock;
    };
}

function makeUseCase(dealAll: DealAllMock, cache: SalesFinanceCacheService) {
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: makeBitrixMock(dealAll),
            PortalModel: makePortalMock(),
        }),
    } as unknown as PBXService;
    return new ClosedSalesUseCase(pbx, cache);
}

function jobData(
    overrides: Partial<ClosedSalesJobData> = {},
): ClosedSalesJobData {
    return {
        domain: 'april.bitrix24.ru',
        forceRefresh: false,
        filters: {
            assignedIds: [10],
            dateFrom: '2026-03-01',
            dateTo: '2026-03-31',
        },
        ...overrides,
    };
}

describe('ClosedSalesUseCase', () => {
    beforeAll(() => {
        jest.useFakeTimers({ now: new Date(2026, 6, 24) }); // 24.07.2026
    });
    afterAll(() => {
        jest.useRealTimers();
    });

    it('полный прошлый месяц берётся из кэша — Bitrix не вызывается', async () => {
        const dealAll = jest.fn();
        const cache = makeCacheMock([]);
        const useCase = makeUseCase(dealAll, cache);

        const report = await useCase.execute(jobData());

        expect(dealAll).not.toHaveBeenCalled();
        expect(report.totals.dealsCount).toBe(0);
        // итог всё равно записывается (короткий TTL)
        expect(cache.setJson).toHaveBeenCalledTimes(1);
    });

    it('промах кэша: запрос в Bitrix и запись месячного сегмента', async () => {
        const dealAll = jest.fn().mockResolvedValue([]);
        const cache = makeCacheMock(null);
        const useCase = makeUseCase(dealAll, cache);

        await useCase.execute(jobData());

        expect(dealAll).toHaveBeenCalledTimes(1);
        const writtenKeys = cache.setJson.mock.calls.map(
            (call: unknown[]) => call[0],
        );
        expect(writtenKeys).toContain(
            'sales-finance:v2:april.bitrix24.ru:closed:month:2026-03:10',
        );
        expect(writtenKeys).toContain(
            'sales-finance:v2:april.bitrix24.ru:closed:result:2026-03-01_2026-03-31_10',
        );
    });

    it('forceRefresh: кэш не читается, но перезаписывается', async () => {
        const dealAll = jest.fn().mockResolvedValue([]);
        const cache = makeCacheMock([]);
        const useCase = makeUseCase(dealAll, cache);

        await useCase.execute(jobData({ forceRefresh: true }));

        expect(cache.getJson).not.toHaveBeenCalled();
        expect(dealAll).toHaveBeenCalledTimes(1);
        expect(cache.setJson).toHaveBeenCalledTimes(2); // сегмент + итог
    });

    it('текущий месяц всегда пересчитывается и не пишется в месячный кэш', async () => {
        const dealAll = jest.fn().mockResolvedValue([]);
        const cache = makeCacheMock([]);
        const useCase = makeUseCase(dealAll, cache);

        await useCase.execute(
            jobData({
                filters: {
                    assignedIds: [10],
                    dateFrom: '2026-07-01',
                    dateTo: '2026-07-31',
                },
            }),
        );

        expect(cache.getJson).not.toHaveBeenCalled(); // сегмент не кэшируемый
        expect(dealAll).toHaveBeenCalledTimes(1);
        expect(cache.setJson).toHaveBeenCalledTimes(1); // только итог
    });
});
