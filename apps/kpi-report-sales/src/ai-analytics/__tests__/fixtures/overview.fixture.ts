import { AnalyticsCallLiteRow } from '@lib/call-lib';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_HOT_STAGE_CODE } from '../../constants/ai-overview.const';
import type { OverviewSources } from '../../domain/assembler/overview-model.types';
import type { AiFinanceResult } from '../../domain/loaders/finance.types';
import type { AiKpiMonthsResult } from '../../domain/loaders/kpi.types';
import {
    DatedLiteRow,
    hasCallDate,
} from '../../domain/loaders/lite-row.mapper';
import type { AiPlansResult } from '../../domain/loaders/plans.types';
import { buildOverviewDto } from '../../domain/presenter/overview.presenter';
import { AiOverviewDto } from '../../dto/ai-overview.dto';
import { liteRow } from './lite-row.fixture';

export const OVERVIEW_DOMAIN = 'april.bitrix24.ru';
export const OVERVIEW_FROM = '2026-08-10';
export const OVERVIEW_TO = '2026-09-06';
/** Понедельник 07.09.2026 12:00 МСК — период закончился вчера. */
export const OVERVIEW_NOW = new Date('2026-09-07T09:00:00Z');

export function emptyKpi(managerIds: number[]): AiKpiMonthsResult {
    return {
        from: OVERVIEW_FROM,
        to: OVERVIEW_TO,
        managerIds,
        months: [],
    };
}

export function emptyFinance(managerIds: number[]): AiFinanceResult {
    return {
        from: OVERVIEW_FROM,
        to: OVERVIEW_TO,
        managerIds,
        pipelineThreshold: 'presentation',
        hotStageCode: AI_ANALYTICS_HOT_STAGE_CODE,
        months: [],
        pipeline: { fromCache: false, managers: [] },
        managers: [],
    };
}

export function emptyPlans(managerIds: number[]): AiPlansResult {
    return {
        managerIds,
        fromCache: false,
        ok: true,
        error: null,
        managers: [],
    };
}

/** N звонков менеджера в периоде с оценкой; переопределения — на все строки. */
export function callsOf(
    managerId: string,
    count: number,
    overrides: Partial<AnalyticsCallLiteRow> = {},
): DatedLiteRow[] {
    return Array.from({ length: count }, (_, index) =>
        liteRow({
            transcriptionId: `${managerId}-${overrides.callType ?? 'presentation'}-${index}`,
            managerId,
            callStartedAt: new Date(
                `2026-08-${String(11 + (index % 20)).padStart(2, '0')}T08:00:00Z`,
            ),
            score: 50 + (index % 5) * 10,
            ...overrides,
        }),
    ).filter(hasCallDate);
}

/** Источники обзора с пустыми KPI/финансами/планами: матрица — по строкам. */
export function overviewSources(
    rows: DatedLiteRow[],
    managerIds: number[],
    overrides: Partial<OverviewSources> = {},
): OverviewSources {
    return {
        domain: OVERVIEW_DOMAIN,
        from: OVERVIEW_FROM,
        to: OVERVIEW_TO,
        confirmedOnly: false,
        calendar: DEFAULT_WORK_CALENDAR,
        enabled: true,
        managerIds,
        rows,
        kpi: emptyKpi(managerIds),
        finance: emptyFinance(managerIds),
        plans: emptyPlans(managerIds),
        org: new Map(),
        levels: new Map(),
        disagreementsCount: 0,
        ...overrides,
    };
}

/** Реальный AiOverviewDto по lite-строкам (без Bitrix). */
export function overviewFixture(
    rows: DatedLiteRow[],
    managerIds: number[],
    overrides: Partial<OverviewSources> = {},
): AiOverviewDto {
    return buildOverviewDto(
        overviewSources(rows, managerIds, overrides),
        OVERVIEW_NOW,
    );
}

/** Два менеджера: 10 — 10 презентаций (n ≥ 8), 20 — 5 презентаций + 3 звонка. */
export function twoManagersRows(): DatedLiteRow[] {
    return [
        ...callsOf('10', 10),
        ...callsOf('20', 5),
        ...callsOf('20', 3, { callType: 'call' }),
    ];
}
