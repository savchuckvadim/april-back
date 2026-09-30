import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../cache/sales-finance-cache.service';
import {
    SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
    SALES_FINANCE_RECENT_MONTH_TTL_SECONDS,
} from '../constants/sales-finance.const';
import { ClosedSalesDealDto } from '../dto/closed-sales-response.dto';
import { ClosedSalesJobData } from '../dto/sales-finance-job.dto';
import { ClosedSalesUseCase } from '../domain/use-cases/closed-sales.use-case';

/**
 * Юнит-тесты оркестрации use-case'а закрытых продаж: общий на домен кэш
 * закрытого месяца с отбором ответственных в памяти, TTL недавних месяцев,
 * forceRefresh, свежесть текущего месяца. Все зависимости замоканы —
 * сети и Redis нет.
 */

const DOMAIN = 'april.bitrix24.ru';
const MONTH_KEY_MARCH = `sales-finance:v8:${DOMAIN}:closed:month:2026-03`;

type DealAllMock = jest.Mock;

function makeBitrixMock(dealAll: DealAllMock) {
    return {
        deal: {
            all: dealAll,
            // живой словарь типов договора (crm.deal.userfield.list)
            getFieldsList: jest.fn().mockResolvedValue({ result: [] }),
        },
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
        // Тип договора и enum-поля компании: в моке полей нет → пустые items.
        getDealFieldByCode: jest.fn().mockReturnValue(undefined),
        getCompanyFieldByCode: jest.fn().mockReturnValue(undefined),
        getFieldBitrixId: jest
            .fn()
            .mockImplementation(
                (field: { bitrixId: string }) => `UF_CRM_${field.bitrixId}`,
            ),
    };
}

/**
 * Кэш: ячейка закрытого месяца отдаёт monthCacheValue, словарь типов
 * договора — закэширован пустым, остальное — промах.
 */
function makeCacheMock(monthCacheValue: unknown = null) {
    const valueOf = (key: string): unknown => {
        if (key.includes(':closed:month:')) return monthCacheValue;
        return key.includes(':dict:') ? [] : null;
    };
    return {
        getJson: jest.fn((key: string) => Promise.resolve(valueOf(key))),
        setJson: jest.fn().mockResolvedValue(undefined),
        getJsonMany: jest.fn().mockResolvedValue([]),
        setJsonMany: jest.fn().mockResolvedValue(undefined),
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
        domain: DOMAIN,
        forceRefresh: false,
        filters: {
            assignedIds: [10],
            dateFrom: '2026-03-01',
            dateTo: '2026-03-31',
        },
        ...overrides,
    };
}

/** Сделка общей ячейки месяца (как её пишет use-case). */
function cachedDeal(id: number, assignedId: number): ClosedSalesDealDto {
    return {
        id,
        title: `Сделка ${id}`,
        assignedId,
        closeDate: '2026-03-15T10:00:00+03:00',
        opportunity: 0,
        advanceAmount: 1000,
        paidMonths: 12,
        monthlyAmount: 100,
        quantity: 1,
        contractStart: null,
        contractEnd: null,
        contractMonths: 0,
        contractTypeCode: null,
        contractTypeName: null,
        expectedContractAmount: 0,
        companyId: null,
        companyName: null,
        companyColor: null,
        companyClientType: null,
    };
}

/** Фильтр первого вызова crm.deal.list. */
function firstFilter(dealAll: DealAllMock): Record<string, unknown> {
    const [firstCall] = dealAll.mock.calls as unknown[][];
    return firstCall[0] as Record<string, unknown>;
}

/** TTL, с которым записан ключ. */
function ttlOf(cache: { setJson: jest.Mock }, key: string): unknown {
    const call = cache.setJson.mock.calls.find(
        (args: unknown[]) => args[0] === key,
    ) as unknown[] | undefined;
    return call?.[2];
}

describe('ClosedSalesUseCase', () => {
    beforeAll(() => {
        jest.useFakeTimers({ now: new Date(2026, 6, 24) }); // 24.07.2026
    });
    afterAll(() => {
        jest.useRealTimers();
    });

    it('закрытый месяц из общего кэша домена — Bitrix не вызывается, ответственные отбираются в памяти', async () => {
        const dealAll = jest.fn();
        const cache = makeCacheMock([
            cachedDeal(1, 10),
            cachedDeal(2, 20),
            cachedDeal(3, 10),
        ]);
        const useCase = makeUseCase(dealAll, cache);

        const report = await useCase.execute(jobData());

        expect(dealAll).not.toHaveBeenCalled();
        expect(cache.getJson).toHaveBeenCalledWith(MONTH_KEY_MARCH);
        expect(report.totals.dealsCount).toBe(2);
        expect(report.employees.map(employee => employee.assignedId)).toEqual([
            10,
        ]);
        expect(report.employees[0].deals.map(deal => deal.id)).toEqual([1, 3]);
        // итог всё равно записывается (короткий TTL)
        expect(cache.setJson).toHaveBeenCalledTimes(1);
    });

    it('промах кэша: месяц читается из Bitrix ЦЕЛИКОМ (без фильтра по сотрудникам) и пишется на домен', async () => {
        const dealAll = jest.fn().mockResolvedValue([]);
        const cache = makeCacheMock(null);
        const useCase = makeUseCase(dealAll, cache);

        await useCase.execute(jobData());

        expect(dealAll).toHaveBeenCalledTimes(1);
        expect(firstFilter(dealAll)).toEqual({
            CATEGORY_ID: '7',
            STAGE_SEMANTIC_ID: 'S',
            '>=CLOSEDATE': '2026-03-01',
            '<=CLOSEDATE': '2026-03-31',
        });
        const writtenKeys = cache.setJson.mock.calls.map(
            (call: unknown[]) => call[0],
        );
        expect(writtenKeys).toContain(MONTH_KEY_MARCH);
        expect(writtenKeys).toContain(
            `sales-finance:v8:${DOMAIN}:closed:result:2026-03-01_2026-03-31_10`,
        );
        // март при «сейчас» в июле — старый закрытый месяц: 30 дней
        expect(ttlOf(cache, MONTH_KEY_MARCH)).toBe(
            SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
        );
    });

    it('последние два закрытых месяца живут сутки: сделки закрывают задним числом', async () => {
        const dealAll = jest.fn().mockResolvedValue([]);
        const cache = makeCacheMock(null);
        const useCase = makeUseCase(dealAll, cache);

        await useCase.execute(
            jobData({
                filters: {
                    assignedIds: [10],
                    dateFrom: '2026-04-01',
                    dateTo: '2026-06-30',
                },
            }),
        );

        const monthKey = (month: string) =>
            `sales-finance:v8:${DOMAIN}:closed:month:${month}`;
        expect(ttlOf(cache, monthKey('2026-06'))).toBe(
            SALES_FINANCE_RECENT_MONTH_TTL_SECONDS,
        );
        expect(ttlOf(cache, monthKey('2026-05'))).toBe(
            SALES_FINANCE_RECENT_MONTH_TTL_SECONDS,
        );
        expect(ttlOf(cache, monthKey('2026-04'))).toBe(
            SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
        );
    });

    it('forceRefresh: кэш не читается, но перезаписывается', async () => {
        const dealAll = jest.fn().mockResolvedValue([]);
        const cache = makeCacheMock([]);
        const useCase = makeUseCase(dealAll, cache);

        await useCase.execute(jobData({ forceRefresh: true }));

        expect(cache.getJson).not.toHaveBeenCalled();
        expect(dealAll).toHaveBeenCalledTimes(1);
        // словарь типов + сегмент + итог (forceRefresh перезаписывает всё)
        expect(cache.setJson).toHaveBeenCalledTimes(3);
    });

    it('текущий месяц всегда пересчитывается по сотрудникам и не пишется в месячный кэш', async () => {
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

        // читается только словарь типов договора, месячный сегмент — нет
        expect(cache.getJson).toHaveBeenCalledTimes(1);
        expect(dealAll).toHaveBeenCalledTimes(1);
        expect(firstFilter(dealAll)['=ASSIGNED_BY_ID']).toEqual(['10']);
        expect(cache.setJson).toHaveBeenCalledTimes(1); // только итог
    });

    it('executeDetailed: закрытые месяцы из кэша перечислены, живой — нет', async () => {
        const dealAll = jest.fn().mockResolvedValue([]);
        const cache = makeCacheMock([cachedDeal(1, 10)]);
        const useCase = makeUseCase(dealAll, cache);

        const { report, cachedMonths } = await useCase.executeDetailed(
            jobData({
                filters: {
                    assignedIds: [10],
                    dateFrom: '2026-05-01',
                    dateTo: '2026-07-20',
                },
            }),
        );

        expect(cachedMonths).toEqual(['2026-05', '2026-06']);
        // живой июль — один запрос в Bitrix по сотрудникам
        expect(dealAll).toHaveBeenCalledTimes(1);
        expect(report.dateFrom).toBe('2026-05-01');
        expect(report.dateTo).toBe('2026-07-20');
    });
});
