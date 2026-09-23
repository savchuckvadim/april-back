import {
    CallReportAnalyticsService,
    type AnalyticsCallRow,
    type CallReportAnalyticsQueryDto,
} from '@lib/call-lib';
import { filterAnalyticsRows } from '@lib/call-lib/call-report-analytics/lib/analytics-query-filter';
import {
    CallReportAnalyticsAggregatorService,
    type ManagersReportBody,
    type SummaryReportBody,
} from '@lib/call-lib/call-report-analytics/services/call-report-analytics-aggregator.service';
import { registryDefault } from '@lib/sales-ai-analytics';
import { ReportKpiUseCase, type ReportGetFiltersDto } from '../../report';
import { KpiLoader } from '../domain/loaders/kpi.loader';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { OverviewUseCase } from '../domain/use-cases/overview.use-case';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import {
    apiMock,
    cacheMock,
    managersMock,
    pbxMock,
} from './fixtures/kpi-loader.fixture';
import {
    callsLoaderWith,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import {
    CONTRACT_DOMAIN,
    CONTRACT_EXPECTED_AVG,
    CONTRACT_FROM,
    CONTRACT_NOW,
    CONTRACT_ROSTER,
    CONTRACT_TO,
    contractCalls,
    contractEdgeCalls,
    toLegacyRow,
    toLiteRow,
    type ContractCall,
} from './fixtures/overview-contract.fixture';
import { emptyFinance, emptyPlans } from './fixtures/overview.fixture';

/**
 * Контракт обзора с существующими ручками (аудит 14.09, M18; план §9 1b
 * п. 3): на одной фикстуре звонков итоги обзора менеджер × тип совпадают
 * с `/call-report/analytics/summary|managers` (фасад
 * `CallReportAnalyticsService` с реальным агрегатором), а KPI-слой — с
 * `/kpi-report/get` (`ReportKpiUseCase`) на том же PBX-моке. В портал не
 * ходим: `PBXService` подменён фабрикой из фикстуры KPI-слоя.
 */
const ROSTER = [...CONTRACT_ROSTER];
const N_MIN_NONE = registryDefault('n_min_none');

/** Фасад легаси-аналитики: выборка подменена, агрегатор настоящий. */
function legacyReports(rows: readonly AnalyticsCallRow[]) {
    const dataService = {
        load: jest.fn((query: CallReportAnalyticsQueryDto) =>
            Promise.resolve({
                ...filterAnalyticsRows([...rows], query),
                totalCalls: rows.length,
            }),
        ),
    };
    const cache = {
        buildKey: jest.fn().mockReturnValue('contract-key'),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CallReportAnalyticsService(
        dataService as never,
        new CallReportAnalyticsAggregatorService(),
        cache as never,
        { save: jest.fn().mockResolvedValue(null) } as never,
    );
    const range = portalRangeUtc(CONTRACT_FROM, CONTRACT_TO, 'Europe/Moscow');
    const query = (
        extra: Partial<CallReportAnalyticsQueryDto> = {},
    ): CallReportAnalyticsQueryDto => ({
        domain: CONTRACT_DOMAIN,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        ...extra,
    });
    // Фасад отдаёт `{meta} & Record<string, unknown>`: тело конкретного
    // отчёта сужается до типов агрегатора через unknown.
    return {
        summary: async (extra?: Partial<CallReportAnalyticsQueryDto>) =>
            (await service.buildReport('summary', query(extra))) as unknown as {
                meta: { totalCalls: number };
            } & SummaryReportBody,
        managers: async (extra?: Partial<CallReportAnalyticsQueryDto>) =>
            (await service.buildReport(
                'managers',
                query(extra),
            )) as unknown as ManagersReportBody,
    };
}

/** Обзор витрины: lite-строки фикстуры, KPI-слой на PBX-моке, остальное пусто. */
async function overviewOf(
    calls: readonly ContractCall[],
): Promise<AiOverviewDto> {
    const pbx = pbxMock(apiMock());
    const managers = managersMock(ROSTER);
    const useCase = new OverviewUseCase(
        settingsLoaderWith(),
        managers.loader,
        callsLoaderWith(calls.map(toLiteRow)).loader,
        new KpiLoader(pbx.service, cacheMock().service, managers.loader),
        {
            loadFinance: jest.fn().mockResolvedValue(emptyFinance(ROSTER)),
        } as never,
        { loadPlans: jest.fn().mockResolvedValue(emptyPlans(ROSTER)) } as never,
        { load: jest.fn().mockResolvedValue(new Map()) } as never,
        { loadLevels: jest.fn().mockResolvedValue(new Map()) } as never,
        { listInPeriod: jest.fn().mockResolvedValue([]) } as never,
    );
    return useCase.execute(
        { domain: CONTRACT_DOMAIN, from: CONTRACT_FROM, to: CONTRACT_TO },
        { now: CONTRACT_NOW },
    );
}

/** `/kpi-report/get` на том же PBX-моке: менеджер → innerCode → count. */
async function legacyKpi(): Promise<Map<number, Map<string, number>>> {
    const report = new ReportKpiUseCase();
    await report.init(CONTRACT_DOMAIN, pbxMock(apiMock()).service);
    const rows = await report.generateKpiReport({
        dateFrom: CONTRACT_FROM,
        dateTo: CONTRACT_TO,
        userIds: ROSTER.map(String),
        departament: ROSTER.map(id => ({
            ID: String(id),
            NAME: '',
            LAST_NAME: '',
        })),
        userFieldId: '',
        dateFieldId: '',
        actionFieldId: '',
        currentActions: {},
    } as ReportGetFiltersDto);
    return new Map(
        rows.map(row => [
            Number(row.id),
            new Map(row.kpi.map(kpi => [kpi.id, Number(kpi.count)])),
        ]),
    );
}

const rowOf = (dto: AiOverviewDto, managerId: string) =>
    dto.managers.find(row => row.managerId === managerId);

describe('overview ↔ /call-report/analytics на одной фикстуре (M18)', () => {
    const calls = contractCalls();
    const legacy = legacyReports(calls.map(toLegacyRow));
    let overview: AiOverviewDto;
    beforeAll(async () => {
        overview = await overviewOf(calls);
    });

    it('итоги по типам: n обзора = byCallType сводного отчёта, 0 расхождений', async () => {
        const summary = await legacy.summary();
        // Обзор отдаёт все типы справочника (регулярная сетка витрины), легаси —
        // только встретившиеся: у типов вне легаси в обзоре ровно ноль.
        const byType = Object.fromEntries(
            overview.totals
                .filter(total => total.n > 0)
                .map(total => [total.callType, total.n]),
        );
        expect(byType).toEqual(summary.byCallType);
        expect(Object.keys(byType).sort()).toEqual([
            'call',
            'cold',
            'presentation',
        ]);
        expect(
            overview.totals.filter(total => !(total.callType in byType)),
        ).toEqual(overview.totals.filter(total => total.n === 0));
        expect(overview.meta.totalCalls).toBe(summary.meta.totalCalls);
    });

    it('по менеджерам: callsTotal = calls = byManager, analyzedCalls = analyzed', async () => {
        const [summary, managers] = await Promise.all([
            legacy.summary(),
            legacy.managers(),
        ]);
        expect(managers.managers.map(stat => stat.managerId).sort()).toEqual(
            ROSTER.map(String),
        );
        for (const stat of managers.managers) {
            const row = rowOf(overview, stat.managerId);
            expect(row?.callsTotal).toBe(stat.calls);
            expect(row?.callsTotal).toBe(summary.byManager[stat.managerId]);
            expect(row?.analyzedCalls).toBe(stat.analyzed);
        }
    });

    it('оценка: keyMetric × 10 = avgWeightedScore при n ≥ n_min_none, ниже — число скрыто', async () => {
        const { managers } = await legacy.managers();
        for (const stat of managers) {
            const row = rowOf(overview, stat.managerId);
            expect(stat.avgWeightedScore).toBe(
                CONTRACT_EXPECTED_AVG[stat.managerId],
            );
            if (stat.analyzed >= N_MIN_NONE) {
                expect(row?.keyMetric.value).not.toBeNull();
                expect((row?.keyMetric.value ?? 0) * 10).toBeCloseTo(
                    stat.avgWeightedScore ?? 0,
                    9,
                );
            } else {
                expect(row?.keyMetric.value).toBeNull();
                expect(row?.keyMetric.confidence.level).toBe('none');
            }
        }
    });

    it('тренды строки — nullable: без снапшота ai-analytics-trends поля нет либо null, при n < n_min_none — никогда не блок', async () => {
        const { managers } = await legacy.managers();
        for (const stat of managers) {
            const row = rowOf(overview, stat.managerId);
            expect(row?.trends ?? null).toBeNull();
            if (stat.analyzed < N_MIN_NONE) {
                expect(row?.trends ?? null).toBeNull();
            }
        }
    });

    it('«год назад» — nullable: без снапшотов manager-month M−12 ни у строк, ни у обзора чисел нет (приёмка П3)', async () => {
        const { managers } = await legacy.managers();
        expect(overview.yoy ?? null).toBeNull();
        for (const stat of managers) {
            expect(rowOf(overview, stat.managerId)?.yoy ?? null).toBeNull();
        }
    });
});

describe('overview ↔ /kpi-report/get на одном PBX-моке (M18)', () => {
    it('дисциплина обзора и счётчики KPI-слоя = строки kpi-report, 0 расхождений', async () => {
        const [overview, report] = await Promise.all([
            overviewOf(contractCalls()),
            legacyKpi(),
        ]);
        const managers = managersMock(ROSTER);
        const months = await new KpiLoader(
            pbxMock(apiMock()).service,
            cacheMock().service,
            managers.loader,
        ).loadKpiMonths(CONTRACT_DOMAIN, CONTRACT_FROM, CONTRACT_TO, ROSTER, {
            now: CONTRACT_NOW,
        });

        expect(report.size).toBe(ROSTER.length);
        expect(months.months).toHaveLength(1);
        for (const managerId of ROSTER) {
            const legacyCounters = report.get(managerId);
            const month = months.months[0].managers.find(
                item => item.managerId === managerId,
            );
            expect(legacyCounters).toBeDefined();
            expect(new Map(Object.entries(month?.counters ?? {}))).toEqual(
                legacyCounters,
            );
            expect(rowOf(overview, String(managerId))?.discipline).toEqual({
                callPlan: legacyCounters?.get('call_plan'),
                callDone: legacyCounters?.get('call_done'),
                presentationPlan: legacyCounters?.get('presentation_plan'),
                presentationDone: legacyCounters?.get('presentation_done'),
            });
        }
    });
});

describe('граница семантик: короткий разбор и звонок без разбора', () => {
    const calls = [...contractCalls(), ...contractEdgeCalls()];
    const legacy = legacyReports(calls.map(toLegacyRow));

    it('callsTotal считает все звонки менеджера, как calls легаси; analyzedCalls режет порогом min_duration_sec', async () => {
        const overview = await overviewOf(calls);
        const all = (await legacy.managers()).managers.find(
            stat => stat.managerId === '10',
        );
        const long = (
            await legacy.managers({
                minDurationSec: registryDefault('min_duration_sec'),
            })
        ).managers.find(stat => stat.managerId === '10');
        const row = rowOf(overview, '10');

        expect(row?.callsTotal).toBe(all?.calls);
        expect(all?.calls).toBe(16);
        // Легаси без фильтра считает короткий разбор (15), витрина — нет (14):
        // разница ровно в одном коротком разобранном звонке.
        expect(all?.analyzed).toBe(15);
        expect(row?.analyzedCalls).toBe(14);
        expect(row?.analyzedCalls).toBe(long?.analyzed);
    });
});
