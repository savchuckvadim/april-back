import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { AI_ANALYTICS_HOT_STAGE_CODE } from '../constants/ai-overview.const';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import type {
    ClosedSalesDealDto,
    ClosedSalesEmployeeDto,
    ClosedSalesExecution,
} from '../../sales-finance';
import { hotDeal, hotReport } from './fixtures/hot-clients.fixture';
import { cacheMock, managersMock } from './fixtures/kpi-loader.fixture';

const NOW = new Date(2026, 8, 6, 12, 0, 0);
const DOMAIN = 'example.bitrix24.ru';
const GENERATED_AT = '2026-09-06T09:00:00.000Z';

/** Закрытая сделка: 1000 аванса, 12 оплаченных месяцев, месячная сумма. */
function deal(
    id: number,
    assignedId: number,
    closeDay: string,
    monthlyAmount = 100,
): ClosedSalesDealDto {
    return {
        id,
        title: `Сделка ${id}`,
        assignedId,
        closeDate: `${closeDay}T12:00:00+03:00`,
        opportunity: 0,
        advanceAmount: 1000,
        paidMonths: 12,
        monthlyAmount,
        quantity: 1,
        contractStart: null,
        contractEnd: null,
        contractMonths: 12,
        contractTypeCode: null,
        contractTypeName: null,
        expectedContractAmount: monthlyAmount * 12,
        companyId: null,
        companyName: null,
        companyColor: null,
        companyClientType: null,
    };
}

/** Сотрудник отчёта: итоги — сумма сделок (как aggregateClosedSales). */
function employee(
    assignedId: number,
    deals: ClosedSalesDealDto[],
    totals: Partial<ClosedSalesEmployeeDto> = {},
): ClosedSalesEmployeeDto {
    const sum = (pick: (item: ClosedSalesDealDto) => number) =>
        deals.reduce((acc, item) => acc + pick(item), 0);
    return {
        assignedId,
        dealsCount: deals.length,
        advanceAmount: sum(item => item.advanceAmount),
        paidMonths: sum(item => item.paidMonths),
        monthlyAmount: sum(item => item.monthlyAmount),
        quantity: sum(item => item.quantity),
        expectedContractAmount: sum(item => item.expectedContractAmount),
        deals,
        ...totals,
    };
}

function execution(
    employees: ClosedSalesEmployeeDto[],
    cachedMonths: string[] = [],
): ClosedSalesExecution {
    return {
        report: {
            employees,
            totals: {
                dealsCount: 0,
                advanceAmount: 0,
                paidMonths: 0,
                monthlyAmount: 0,
                quantity: 0,
                expectedContractAmount: 0,
            },
            dateFrom: '2026-07-15',
            dateTo: '2026-09-06',
            generatedAt: GENERATED_AT,
        },
        cachedMonths: cachedMonths as ClosedSalesExecution['cachedMonths'],
    };
}

/** Менеджер 1 продаёт каждый месяц, менеджер 2 — только в августе. */
const DEFAULT_EMPLOYEES = [
    employee(1, [
        deal(11, 1, '2026-07-20'),
        deal(12, 1, '2026-08-10'),
        deal(13, 1, '2026-09-03'),
    ]),
    employee(2, [deal(21, 2, '2026-08-31', 200)]),
];

function makeLoader(
    closed: ClosedSalesExecution = execution(DEFAULT_EMPLOYEES, ['2026-08']),
) {
    const closedExecute = jest.fn(() => Promise.resolve(closed));
    const hotExecute = jest.fn(() =>
        Promise.resolve(
            hotReport([
                hotDeal(1, 'sales_pres', 50),
                hotDeal(1, 'sales_in_progress', 70, { companyColor: 'green' }),
                hotDeal(2, 'sales_offer_create', 30), // ниже «В решении» — не горячая
                hotDeal(9, 'sales_in_progress', 999), // вне ростера
            ]),
        ),
    );
    const factory = {
        create: () => ({
            closed: { executeDetailed: closedExecute },
            hot: { execute: hotExecute },
        }),
    };
    const cache = cacheMock();
    const managers = managersMock();
    const loader = new FinanceLoader(
        factory as never,
        cache.service,
        managers.loader,
    );
    return { loader, closedExecute, hotExecute, cache, managers };
}

describe('FinanceLoader', () => {
    it('закрытые продажи — ОДНИМ вызовом за весь период обзора, как вкладка «Финансы»', async () => {
        const { loader, closedExecute } = makeLoader();

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-07-15',
            '2026-09-06',
            ['2', 1],
            { now: NOW },
        );

        expect(result.managerIds).toEqual([1, 2]);
        expect(closedExecute).toHaveBeenCalledTimes(1);
        expect(closedExecute).toHaveBeenCalledWith({
            domain: DOMAIN,
            forceRefresh: false,
            filters: {
                assignedIds: [1, 2],
                dateFrom: '2026-07-15',
                dateTo: '2026-09-06',
            },
        });
    });

    it('сводка — итоги сотрудника из отчёта как есть + пайплайн v2 и откуда числа', async () => {
        const { loader, hotExecute } = makeLoader();

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-07-15',
            '2026-09-06',
            [1, 2],
            { now: NOW },
        );

        expect(result.pipelineThreshold).toBe('presentation');
        expect(result.hotStageCode).toBe(AI_ANALYTICS_HOT_STAGE_CODE);
        expect(hotExecute).toHaveBeenCalledWith({
            domain: DOMAIN,
            threshold: 'presentation',
            assignedIds: [1, 2],
            forceRefresh: false,
        });
        const [summary1, summary2] = result.managers;
        expect(summary1).toEqual({
            managerId: 1,
            salesCount: 3,
            advanceAmount: 3000,
            paidMonths: 36,
            monthlyAmount: 300,
            expectedContractAmount: 3600,
            pipelineFromStage: { count: 2, monthlyAmount: 120 },
            hotEvents: 1,
            hotByColor: { green: 1, yellow: 0, red: 0, none: 0 },
            withOfferCount: 0,
            pipelineByContractType: [
                {
                    code: null,
                    name: null,
                    count: 2,
                    monthlyAmount: 120,
                    advanceAmount: 0,
                },
            ],
            pipelineByTerm: [
                {
                    bucket: 'none',
                    count: 2,
                    monthlyAmount: 120,
                    expectedContractAmount: null,
                },
            ],
            source: {
                from: '2026-07-15',
                to: '2026-09-06',
                generatedAt: GENERATED_AT,
            },
        });
        expect(summary2.salesCount).toBe(1);
        expect(summary2.pipelineFromStage).toEqual({
            count: 1,
            monthlyAmount: 30,
        });
        expect(summary2.hotEvents).toBe(0);
    });

    it('кейс Агеевой: 2 сделки, аванс 69 024, месячная сумма 9 127 — ровно как в «Финансах»', async () => {
        const ageeva = employee(
            5,
            [deal(51, 5, '2026-05-12'), deal(52, 5, '2026-06-30')],
            { advanceAmount: 69024, monthlyAmount: 9127 },
        );
        const { loader } = makeLoader(execution([ageeva]));

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-04-27',
            '2026-07-26',
            [5],
            { now: NOW },
        );

        expect(result.managers[0]).toMatchObject({
            managerId: 5,
            salesCount: 2,
            advanceAmount: 69024,
            monthlyAmount: 9127,
        });
    });

    it('помесячная разбивка — по дате закрытия сделок; сумма месяцев = период', async () => {
        const { loader } = makeLoader();

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-07-15',
            '2026-09-06',
            [1, 2],
            { now: NOW },
        );

        expect(result.months.map(month => [month.month, month.closed])).toEqual(
            [
                ['2026-07', false],
                ['2026-08', true],
                ['2026-09', false],
            ],
        );
        // месяц из кэша sales-finance — Bitrix за ним не ходили
        expect(result.months.map(month => month.fromCache)).toEqual([
            false,
            true,
            false,
        ]);
        // менеджер 2 без продаж в июле — строка с нулями
        expect(result.months[0].managers[1]).toEqual({
            managerId: 2,
            salesCount: 0,
            advanceAmount: 0,
            paidMonths: 0,
            monthlyAmount: 0,
            expectedContractAmount: 0,
        });
        // сделка 31 августа — в августе, не в сентябре
        expect(result.months[1].totals.monthlyAmount).toBe(300);
        expect(result.months[1].managers[1].salesCount).toBe(1);
        for (const summary of result.managers) {
            const months = result.months.map(
                month =>
                    month.managers.find(
                        row => row.managerId === summary.managerId,
                    )!,
            );
            expect(months.reduce((sum, row) => sum + row.salesCount, 0)).toBe(
                summary.salesCount,
            );
            expect(
                months.reduce((sum, row) => sum + row.monthlyAmount, 0),
            ).toBe(summary.monthlyAmount);
        }
    });

    it('своего кэша закрытых продаж нет: пишется только пайплайн (180 с, ключ со стадией «горячих»)', async () => {
        const { loader, cache } = makeLoader();

        await loader.loadFinance(DOMAIN, '2026-07-01', '2026-09-06', [1, 2], {
            now: NOW,
        });

        expect(
            cache.setJson.mock.calls.map(call => [call[0], call[2]]),
        ).toEqual([
            [
                `sales-ai-analytics:v1:${DOMAIN}:finance-pipeline:presentation-sales_in_progress:1_2`,
                180,
            ],
        ]);
        expect(
            cache.getJson.mock.calls.every(([key]) =>
                key.includes(':finance-pipeline:'),
            ),
        ).toBe(true);
    });

    it('forceRefresh обходит чтение кэша и прокидывается в use-case’ы; hotStageCode переопределяется', async () => {
        const { loader, closedExecute, hotExecute, cache } = makeLoader();

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-08-01',
            '2026-08-31',
            [1, 2],
            {
                now: NOW,
                forceRefresh: true,
                pipelineThreshold: 'document',
                hotStageCode: PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
            },
        );

        expect(cache.getJson).not.toHaveBeenCalled();
        expect(closedExecute).toHaveBeenCalledWith(
            expect.objectContaining({ forceRefresh: true }),
        );
        expect(hotExecute).toHaveBeenCalledWith(
            expect.objectContaining({
                threshold: 'document',
                forceRefresh: true,
            }),
        );
        expect(result.hotStageCode).toBe(
            PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
        );
        // при пороге «Документы» сделка менеджера 2 на sales_offer_create — горячая
        expect(result.managers[1].hotEvents).toBe(1);
        const keys = cache.setJson.mock.calls.map(call => String(call[0]));
        expect(keys).toContainEqual(
            expect.stringContaining('document-sales_offer_create:1_2'),
        );
    });

    it('сделка с нераспознанной датой закрытия: в сводке есть, в месяцы не попадает', async () => {
        const odd = { ...deal(61, 1, '2026-08-10'), closeDate: '' };
        const { loader } = makeLoader(execution([employee(1, [odd])]));

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-08-01',
            '2026-08-31',
            [1],
            { now: NOW },
        );

        expect(result.managers[0].salesCount).toBe(1);
        expect(result.months[0].managers[0].salesCount).toBe(0);
    });

    it('пустой ростер — use-case’ы не вызываются, результат пустой', async () => {
        const { loader, closedExecute, hotExecute, managers } = makeLoader();
        managers.resolve.mockResolvedValueOnce([]);

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-08-01',
            '2026-08-31',
        );

        expect(closedExecute).not.toHaveBeenCalled();
        expect(hotExecute).not.toHaveBeenCalled();
        expect(result.managers).toEqual([]);
        expect(result.months[0].managers).toEqual([]);
    });
});
