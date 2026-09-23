import type { OverviewYoySnapshots } from '../loaders/overview-snapshots.loader';
/**
 * Внутренняя модель шага overview (между loader'ами, assembler'ами и
 * presenter'ом). В DTO не уезжает — presenter переводит её в
 * AiOverviewDto.
 */
import type { MetricValue, WorkCalendar } from '@lib/sales-ai-analytics';
import type { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type { AiAnalyticsAlertKind } from '../../constants/ai-analytics.const';
import type { AiManagerLevelRecord } from '../../store/ai-analytics-settings.store';
import type { AiFinanceResult } from '../loaders/finance.types';
import type {
    AiKpiDocuments,
    AiKpiMonthsResult,
    AiKpiOutcomes,
    AiKpiPlanFact,
    AiKpiTypeFact,
} from '../loaders/kpi.types';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type { ManagerOrg } from '../loaders/manager-org.loader';
import type { AiPlansResult } from '../loaders/plans.types';
import type { PortalModelPayload } from './portal-model.types';

/**
 * Снапшоты Фазы 2 в том виде, в каком они приходят из `ais`: форма чужая
 * и может быть неполной, поэтому читается структурно. Пусто — витрина
 * работает как в Фазе 1b (§5.4).
 */
export type PortalModelView = Partial<PortalModelPayload>;

/** Дневной прогноз менеджера (`ai-analytics-forecast`). */
export interface ForecastView {
    /** Рычаги, отобранные ночным шагом (`buildLevers`). */
    levers?: unknown;
    /** `Y₀` — продажи месяца по эпизодам и финансам. */
    doneSales?: unknown;
}

/** Профиль стиля менеджера (`ai-analytics-style`). */
export interface StyleView {
    calls?: unknown;
    vector?: unknown;
    tags?: unknown;
    confidence?: unknown;
}

/** Снапшоты Фазы 2, которые читает витрина обзора. */
export interface OverviewSnapshots {
    /** Месячная модель портала; null — норм нет. */
    model?: PortalModelView | null;
    /** Дневной прогноз по менеджеру. */
    forecasts?: ReadonlyMap<string, ForecastView>;
    /** Профиль стиля по менеджеру. */
    styles?: ReadonlyMap<string, StyleView>;
}

/** Всё, что нужно presenter'у обзора, собранное loader'ами параллельно. */
export interface OverviewSources {
    domain: string;
    from: string;
    to: string;
    confirmedOnly: boolean;
    calendar: WorkCalendar;
    /** ai_analytics_enabled портала (для readiness). */
    enabled: boolean;
    /** Нормализованный ростер (явные managerIds либо структура). */
    managerIds: number[];
    rows: DatedLiteRow[];
    kpi: AiKpiMonthsResult;
    finance: AiFinanceResult;
    plans: AiPlansResult;
    org: Map<number, ManagerOrg>;
    levels: Map<number, AiManagerLevelRecord>;
    /** Реакций disagree за период. */
    disagreementsCount: number;
    /** Снапшоты Фазы 2: модель портала, прогнозы, профили стиля. */
    snapshots?: OverviewSnapshots;
    /** Месяцы года назад для блока «год назад» (П3); undefined — не читались. */
    yoy?: OverviewYoySnapshots;
    /** `ai_analytics_roster_confirmed_at`; '' — состав не подтверждали. */
    rosterConfirmedAt?: string;
    /** Пар в `ai_analytics_hypothesis` (режим `hypothesis` требует ≥ 2). */
    hypothesisPairs?: number;
}

/** KPI-факты менеджера за период: сумма месячных сегментов. */
export interface ManagerKpiPeriod {
    managerId: number;
    calls: AiKpiPlanFact;
    presentations: AiKpiPlanFact;
    presentationsUniq: AiKpiPlanFact;
    presentationsContactUniq: AiKpiPlanFact;
    documents: AiKpiDocuments;
    outcomes: AiKpiOutcomes;
    byType: Record<CallReportCallTypeCode, AiKpiTypeFact>;
}

/** Риск-звонок для строки и «Внимания». */
export interface ManagerRiskCall {
    transcriptionId: string;
    kind: AiAnalyticsAlertKind;
    callStartedAt: string;
}

/** Доля «шаг с датой» за два последних окна периода. */
export interface ManagerNextStepRates {
    windowDays: number;
    current: MetricValue;
    previous: MetricValue;
}

/** Факты по звонкам менеджера, не входящие в матрицу. */
export interface ManagerCallFacts {
    managerId: string;
    /** Всех звонков в телефонии (включая без разбора и короткие). */
    callsTotal: number;
    riskCalls: ManagerRiskCall[];
    nextStepRate: ManagerNextStepRates;
    /** Доля отработанных возражений по всем типам, %; null — возражений нет. */
    handledRatePct: MetricValue | null;
}
