/**
 * Сборка нагрузки месячной модели портала (план Фазы 2, поток 16a):
 * нормы рёбер и менеджеров, сила усадки, сверхдисперсия, качество,
 * потолок темпа, медиана цикла, шкала лага, стадийные θ, трактовка
 * рёбер, режим связи качества с исходом, готовность, сезон, санити и
 * журнал событий.
 *
 * Здесь ОРКЕСТРАЦИЯ готовых функций библиотеки, а не своя математика:
 * `buildPortalNorms` (leave-one-out + κ Клейнмана), `estimateMS`,
 * `capacityQuantile`, `kaplanMeierLagCdf`, `betaGateCountdown`,
 * `buildReadiness`. Собственных порогов и формул файл не держит.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()` внутри —
 * момент расчёта приходит в `meta.generatedAt`.
 */
import {
    AI_READINESS_GATE_DEFAULTS,
    betaGateCountdown,
    buildReadiness,
    estimateEdgeKappa,
    resolveNumberParam,
    type AiBetaSource,
    type AiEdgeEstimand,
    type ParamContext,
    type QualityGroup,
    type SaleLag,
    type StageTheta,
} from '@lib/sales-ai-analytics';
import type { AiPortalEvent } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import {
    AI_PORTAL_CAP_ACTIVITY,
    AI_PORTAL_SEASON_NOT_ESTIMATED,
} from '../../constants/ai-portal-model.const';
import type { AiSanityReport } from '../../steps/sanity.types';
import type { AiSnapshotMeta } from './manager-snapshot.types';
import {
    capOf,
    lagCdfOf,
    msOf,
    overdispersionOf,
    sRefOf,
    stageThetaFactsOf,
} from './portal-model.estimates';
import { buildPortalNorms } from './portal-model.norms';
import type {
    PortalManagerMonth,
    PortalModelSignature,
    PortalModelPayload,
} from './portal-model.types';

/** Минимум пар гипотезы портала для режима `hypothesis` (план §4.11). */
const MIN_HYPOTHESIS_PAIRS = 2;

/** Решения портала, от которых зависит режим готовности витрины. */
export interface PortalReadinessFacts {
    /** AI-аналитика включена для портала. */
    readonly enabled: boolean;
    /** Есть разборы в окне конвейера; иначе режим `kpi-only`. */
    readonly pipelineEnabled: boolean;
    /** Производственный календарь портала импортирован. */
    readonly calendarImported: boolean;
    /** Записей в `ai_analytics_levels`. */
    readonly rosterLevels: number;
    /** `ai_analytics_roster_confirmed_at`; '' — не подтверждён. */
    readonly rosterConfirmedAt: string;
    /** Начало сравнимой истории 'YYYY-MM-DD'; '' — ряд не рвался. */
    readonly comparableFrom: string;
}

/** Вход сборки модели портала за месяц. */
export interface PortalModelBuildInput {
    readonly monthKey: string;
    /** Окно оценки: месяцы 'YYYY-MM' по возрастанию. */
    readonly window: readonly string[];
    /** Месячные снапшоты менеджеров окна. */
    readonly months: readonly PortalManagerMonth[];
    readonly registry: ParamContext;
    /** Сырые оценки разборов по менеджерам (шкала 1–10) для ANOVA. */
    readonly qualityGroups: readonly QualityGroup[];
    readonly stageThetas: readonly StageTheta[];
    readonly saleLags: readonly SaleLag[];
    /** Медиана цикла по фактам; null — берётся значение реестра. */
    readonly cycleMedianDays: number | null;
    readonly chainSharePct: number;
    readonly edgeKind: AiEdgeEstimand;
    readonly edgeKindReason: string;
    /** Глубина истории стадий в месяцах (гейт готовности). */
    readonly historyMonths: number;
    /** Пар в `ai_analytics_hypothesis`. */
    readonly hypothesisPairs: number;
    readonly readiness: PortalReadinessFacts;
    readonly sanity: AiSanityReport | null;
    /** Журнал портала после слияния с автособытиями. */
    readonly events: readonly AiPortalEvent[];
    /** Автособытия, найденные этим пересчётом. */
    readonly detectedEvents: readonly AiPortalEvent[];
    /** Сигнатура источников — вход обнаружения автособытий в следующий раз. */
    readonly signature: PortalModelSignature;
    readonly meta: AiSnapshotMeta;
}

/** Объёмы окна: презентации, продажи и месяцы с данными. */
function volumesOf(months: readonly PortalManagerMonth[]): {
    presentations: number;
    sales: number;
    monthsWithData: number;
} {
    return {
        presentations: months.reduce(
            (sum, month) => sum + Math.max(0, month.presentations),
            0,
        ),
        sales: months.reduce(
            (sum, month) => sum + Math.max(0, month.salesCount),
            0,
        ),
        monthsWithData: new Set(months.map(month => month.monthKey)).size,
    };
}

/**
 * κ по умолчанию для рёбер без собственной оценки: гибрид реестра
 * (`kappa_edge_early` первые месяцы, дальше `kappa_edge_late`). Считает
 * библиотека — гейт при пустой выборке заведомо закрыт.
 */
function defaultKappaOf(registry: ParamContext, months: number): number {
    const early = resolveNumberParam('kappa_edge_early', registry);
    const late = resolveNumberParam('kappa_edge_late', registry);

    return estimateEdgeKappa({
        cells: [],
        months,
        params: {
            ...(early === undefined ? {} : { edgeEarly: early }),
            ...(late === undefined ? {} : { edgeLate: late }),
        },
    }).kappa;
}

/**
 * Режим связи «качество → исход» до Фазы 4: оценки на данных нет, поэтому
 * либо гипотеза портала (≥ 2 пар), либо честное «связи нет».
 */
function betaSourceOf(hypothesisPairs: number): AiBetaSource {
    return hypothesisPairs >= MIN_HYPOTHESIS_PAIRS ? 'hypothesis' : 'none';
}

/**
 * Нагрузка снапшота `ai-analytics-portal-model` за месяц. Пустое окно
 * сюда не приходит: переиспользование прошлой модели решает сценарий.
 */
export function buildPortalModelPayload(
    input: PortalModelBuildInput,
): PortalModelPayload {
    // Месяцев истории — столько, сколько их РЕАЛЬНО в данных: гейт
    // Клейнмана открывается по накопленной истории, а не по ширине
    // запрошенного окна (иначе новый портал сразу получил бы κ_late).
    const windowMonths = new Set(input.months.map(month => month.monthKey))
        .size;
    const norms = buildPortalNorms({
        months: input.months,
        windowMonths,
        registry: input.registry,
    });
    const volumes = volumesOf(input.months);
    const ms = msOf(input.qualityGroups, input.registry);
    const sRef = sRefOf(input.months, input.window, input.registry);
    const cap = capOf(input.months, input.registry);
    const betaSource = betaSourceOf(input.hypothesisPairs);
    const countdown = betaGateCountdown({
        presentations: volumes.presentations,
        presentationsPerMonth:
            volumes.monthsWithData > 0
                ? volumes.presentations / volumes.monthsWithData
                : 0,
    });
    const readiness = buildReadiness(
        {
            enabled: input.readiness.enabled,
            pipelineEnabled: input.readiness.pipelineEnabled,
            historyMonths: input.historyMonths,
            presentations: volumes.presentations,
            sales: volumes.sales,
            comparableFrom: input.readiness.comparableFrom,
            calendarImported: input.readiness.calendarImported,
            rosterLevels: input.readiness.rosterLevels,
            rosterConfirmedAt: input.readiness.rosterConfirmedAt,
            hypothesisPairs: input.hypothesisPairs,
            betaSource,
            betaCountdown: countdown,
        },
        AI_READINESS_GATE_DEFAULTS,
    );
    const cycleMedianDays =
        input.cycleMedianDays ??
        resolveNumberParam('cycle_median_days', input.registry) ??
        null;

    return {
        monthKey: input.monthKey,
        window: [...input.window],
        observations: input.months.filter(month => !month.excludeFromNorms)
            .length,
        managers: new Set(input.months.map(month => month.managerId)).size,
        edges: norms.edges,
        managerNorms: norms.managerNorms,
        kappa: defaultKappaOf(input.registry, windowMonths),
        overdispersion: overdispersionOf(input.registry),
        mS: ms.value,
        msSource: ms.source,
        msGroups: ms.groups,
        sRef: sRef.value,
        sRefSource: sRef.source,
        cap: cap.cap,
        capSource: cap.source,
        capActivity: AI_PORTAL_CAP_ACTIVITY,
        cycleMedianDays,
        lagCdf: lagCdfOf(input.saleLags, cycleMedianDays, input.registry),
        stageTheta: stageThetaFactsOf(input.stageThetas),
        chainSharePct: input.chainSharePct,
        edgeKind: input.edgeKind,
        edgeKindReason: input.edgeKindReason,
        betaSource: readiness.betaSource,
        betaCountdown: readiness.betaCountdown,
        season: { ...AI_PORTAL_SEASON_NOT_ESTIMATED },
        readiness: {
            mode: readiness.mode,
            historyMonths: readiness.historyMonths,
            presentations: readiness.presentations,
            sales: readiness.sales,
            comparableFrom: readiness.comparableFrom,
            reasons: readiness.reasons,
        },
        sanity: input.sanity,
        events: [...input.events],
        detectedEvents: [...input.detectedEvents],
        reused: false,
        reusedReason: null,
        signature: input.signature,
        meta: input.meta,
    };
}
