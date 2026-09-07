import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { AI_ANALYTICS_HOT_STAGE_CODE } from '../constants/ai-overview.const';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import type { AiFinanceMonth } from '../domain/loaders/finance.types';
import { buildFinanceMonthKey } from '../domain/loaders/loader-cache-key.util';
import type {
    ClosedSalesEmployeeDto,
    ClosedSalesReportDto,
} from '../../sales-finance';
import { hotDeal, hotReport } from './fixtures/hot-clients.fixture';
import { cacheMock, managersMock } from './fixtures/kpi-loader.fixture';

const NOW = new Date(2026, 8, 6, 12, 0, 0);
const DOMAIN = 'example.bitrix24.ru';

function employee(
    assignedId: number,
    totals: Partial<ClosedSalesEmployeeDto> = {},
): ClosedSalesEmployeeDto {
    return {
        assignedId,
        dealsCount: 1,
        advanceAmount: 1000,
        paidMonths: 12,
        monthlyAmount: 100,
        quantity: 1,
        expectedContractAmount: 1200,
        deals: [],
        ...totals,
    };
}

function closedReport(
    employees: ClosedSalesEmployeeDto[],
): ClosedSalesReportDto {
    return {
        employees,
        totals: {
            dealsCount: 0,
            advanceAmount: 0,
            paidMonths: 0,
            monthlyAmount: 0,
            quantity: 0,
            expectedContractAmount: 0,
        },
        dateFrom: '',
        dateTo: '',
        generatedAt: '',
    };
}

function makeLoader(preset: Record<string, unknown> = {}) {
    const closedExecute = jest.fn(
        (job: {
            forceRefresh: boolean;
            filters: { assignedIds: number[]; dateFrom: string };
        }) =>
            Promise.resolve(
                closedReport(
                    // менеджер 1 продаёт каждый месяц, менеджер 2 — только в августе
                    job.filters.assignedIds
                        .filter(
                            id =>
                                id === 1 ||
                                job.filters.dateFrom.startsWith('2026-08'),
                        )
                        .map(id => employee(id, { monthlyAmount: 100 * id })),
                ),
            ),
    );
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
            closed: { execute: closedExecute },
            hot: { execute: hotExecute },
        }),
    };
    const cache = cacheMock(preset);
    const managers = managersMock();
    const loader = new FinanceLoader(
        factory as never,
        cache.service,
        managers.loader,
    );
    return { loader, closedExecute, hotExecute, cache, managers };
}

describe('FinanceLoader', () => {
    it('месяцы через ClosedSalesUseCase по сегментам, сводка суммирует месяцы и пайплайн v2', async () => {
        const { loader, closedExecute, hotExecute } = makeLoader();

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-07-15',
            '2026-09-06',
            ['2', 1],
            { now: NOW },
        );

        expect(result.managerIds).toEqual([1, 2]);
        expect(result.pipelineThreshold).toBe('presentation');
        expect(result.hotStageCode).toBe(AI_ANALYTICS_HOT_STAGE_CODE);
        expect(closedExecute).toHaveBeenCalledTimes(3);
        expect(closedExecute).toHaveBeenNthCalledWith(1, {
            domain: DOMAIN,
            forceRefresh: false,
            filters: {
                assignedIds: [1, 2],
                dateFrom: '2026-07-15',
                dateTo: '2026-07-31',
            },
        });
        expect(result.months.map(m => [m.month, m.closed])).toEqual([
            ['2026-07', false],
            ['2026-08', true],
            ['2026-09', false],
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
        expect(result.months[1].totals.monthlyAmount).toBe(300);

        expect(hotExecute).toHaveBeenCalledTimes(1);
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
        });
        expect(summary2.salesCount).toBe(1);
        expect(summary2.pipelineFromStage).toEqual({
            count: 1,
            monthlyAmount: 30,
        });
        expect(summary2.hotEvents).toBe(0);
    });

    it('закрытый месяц из кэша: use-case не вызывается для него, TTL 30 дней при записи', async () => {
        const augustKey = buildFinanceMonthKey(
            DOMAIN,
            {
                from: '2026-08-01',
                to: '2026-08-31',
                month: '2026-08',
                cacheable: true,
            },
            '1_2',
        );
        const cachedAugust: AiFinanceMonth = {
            month: '2026-08',
            from: '2026-08-01',
            to: '2026-08-31',
            closed: true,
            fromCache: false,
            managers: [],
            totals: {
                salesCount: 0,
                advanceAmount: 0,
                paidMonths: 0,
                monthlyAmount: 0,
                expectedContractAmount: 0,
            },
        };
        const { loader, closedExecute, cache } = makeLoader({
            [augustKey]: cachedAugust,
        });

        const result = await loader.loadFinance(
            DOMAIN,
            '2026-07-01',
            '2026-09-06',
            [1, 2],
            { now: NOW },
        );

        expect(result.months[1].fromCache).toBe(true);
        expect(
            closedExecute.mock.calls.map(call => call[0].filters.dateFrom),
        ).toEqual(['2026-07-01', '2026-09-01']);
        const ttlByKey = new Map(
            cache.setJson.mock.calls.map(call => [call[0], call[2]] as const),
        );
        expect(
            ttlByKey.get(
                buildFinanceMonthKey(
                    DOMAIN,
                    {
                        from: '2026-07-01',
                        to: '2026-07-31',
                        month: '2026-07',
                        cacheable: true,
                    },
                    '1_2',
                ),
            ),
        ).toBe(30 * 24 * 3600);
        // ключ пайплайна включает стадию «горячих» — старые записи с другим порогом не читаются
        expect(
            ttlByKey.get(
                `sales-ai-analytics:v1:${DOMAIN}:finance-pipeline:presentation-sales_in_progress:1_2`,
            ),
        ).toBe(180);
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
        expect(closedExecute.mock.calls[0][0].forceRefresh).toBe(true);
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
