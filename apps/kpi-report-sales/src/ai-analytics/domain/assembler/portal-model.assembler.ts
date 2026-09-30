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
 * `buildReadiness` + `elevateReadiness` (ступени L4/L5). Части Фазы 4 —
 * `portal-model.phase4.ts` и `portal-model.estimates.phase4.ts`.
 * Собственных порогов и формул файл не держит.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()` внутри —
 * момент расчёта приходит в `meta.generatedAt`.
 */
import {
    AI_READINESS_GATE_DEFAULTS,
    betaGateCountdown,
    buildReadiness,
    elevateReadiness,
    estimateEdgeKappa,
    readinessStageGatesOf,
    resolveNumberParam,
    type AiEdgeEstimand,
    type ParamContext,
    type QualityGroup,
    type SaleLag,
    type StageTheta,
} from '@lib/sales-ai-analytics';
import type { AiPortalEvent } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { AI_PORTAL_CAP_ACTIVITY } from '../../constants/ai-portal-model.const';
import type { AiSanityReport } from '../../steps/sanity.types';
import type { AiCalendarSource } from '../loaders/calendar.util';
import type { AiSnapshotMeta } from './manager-snapshot.types';
import {
    capOf,
    msOf,
    sRefOf,
    stageThetaFactsOf,
} from './portal-model.estimates';
import {
    lagPhase4Of,
    overdispersionPhase4Of,
    seasonPhase4Of,
} from './portal-model.estimates.phase4';
import { checkPhase4Of } from './portal-model.check.phase4';
import { buildPortalNorms } from './portal-model.norms';
import {
    modelBetaCountdownOf,
    modelBetaSourceOf,
    normsPoolOf,
    poolUsageOf,
    qualityLinkFactsOf,
    readinessStagesOf,
} from './portal-model.phase4';
import type { PortalModelPhase4Facts } from './portal-model.phase4.types';
import type {
    PortalManagerMonth,
    PortalModelSignature,
    PortalModelPayload,
} from './portal-model.types';

/** Решения портала, от которых зависит режим готовности витрины. */
export interface PortalReadinessFacts {
    /** AI-аналитика включена для портала. */
    readonly enabled: boolean;
    /** Есть разборы в окне конвейера; иначе режим `kpi-only`. */
    readonly pipelineEnabled: boolean;
    /** Производственный календарь портала импортирован. */
    readonly calendarImported: boolean;
    /** Источник календаря прогона; нет — вызывающий его не знает. */
    readonly calendarSource?: AiCalendarSource;
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
    /** Месяцы глубины сезона (≥ гейта); нет — сезон по окну норм. */
    readonly seasonMonths?: readonly PortalManagerMonth[];
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
    /** Входы Фазы 4 (связь качества, пул, ступени L4/L5, недели φ). */
    readonly phase4?: PortalModelPhase4Facts;
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
 * Нагрузка снапшота `ai-analytics-portal-model` за месяц. Пустое окно
 * сюда не приходит: переиспользование прошлой модели решает сценарий.
 * Входы Фазы 4 необязательны: без снапшотов и флагов ступени L4/L5 не
 * рассматриваются, связь качества, пул и φ по неделям — прежние (§5.4).
 */
export function buildPortalModelPayload(
    input: PortalModelBuildInput,
): PortalModelPayload {
    const phase4 = input.phase4 ?? {};
    // Месяцев истории — столько, сколько их РЕАЛЬНО в данных: гейт
    // Клейнмана открывается по накопленной истории, а не по ширине
    // запрошенного окна (иначе новый портал сразу получил бы κ_late).
    const windowMonths = new Set(input.months.map(month => month.monthKey))
        .size;
    const normsPool = normsPoolOf(phase4.pool, input.edgeKind, input.registry);
    const norms = buildPortalNorms({
        months: input.months,
        windowMonths,
        registry: input.registry,
        pool: normsPool,
    });
    const volumes = volumesOf(input.months);
    const ms = msOf(input.qualityGroups, input.registry);
    const sRef = sRefOf(input.months, input.window, input.registry);
    const cap = capOf(input.months, input.registry);
    const link = qualityLinkFactsOf(phase4.qualityLink);
    const countdown = modelBetaCountdownOf(
        phase4.qualityLink,
        betaGateCountdown({
            presentations: volumes.presentations,
            presentationsPerMonth:
                volumes.monthsWithData > 0
                    ? volumes.presentations / volumes.monthsWithData
                    : 0,
        }),
    );
    const base = buildReadiness(
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
            betaSource: modelBetaSourceOf(input.hypothesisPairs, link),
            betaCountdown: countdown,
        },
        AI_READINESS_GATE_DEFAULTS,
    );
    const stages = readinessStagesOf(phase4, input.registry);
    const stageGates = readinessStageGatesOf(input.registry);
    const readiness =
        stages === null ? base : elevateReadiness(base, stages, stageGates);
    const lag = lagPhase4Of(
        input.saleLags,
        input.cycleMedianDays,
        input.registry,
        phase4.pool,
    );
    const phi = overdispersionPhase4Of(phase4.weeklyActivity, input.registry);
    const season = seasonPhase4Of(
        input.seasonMonths ?? input.months,
        input.monthKey,
        input.registry,
        phase4.pool,
    );
    const check = checkPhase4Of(input.months, phase4.pool, input.registry);

    return {
        monthKey: input.monthKey,
        window: [...input.window],
        observations: input.months.filter(month => !month.excludeFromNorms)
            .length,
        managers: new Set(input.months.map(month => month.managerId)).size,
        edges: norms.edges,
        managerNorms: norms.managerNorms,
        kappa: defaultKappaOf(input.registry, windowMonths),
        overdispersion: phi.estimate,
        overdispersionFit: phi.fit,
        mS: ms.value,
        msSource: ms.source,
        msGroups: ms.groups,
        sRef: sRef.value,
        sRefSource: sRef.source,
        cap: cap.cap,
        capSource: cap.source,
        capActivity: AI_PORTAL_CAP_ACTIVITY,
        cycleMedianDays: lag.cycleMedianDays,
        lagCdf: lag.lagCdf,
        lagShrink: lag.shrink,
        stageTheta: stageThetaFactsOf(input.stageThetas),
        chainSharePct: input.chainSharePct,
        edgeKind: input.edgeKind,
        edgeKindReason: input.edgeKindReason,
        betaSource: readiness.betaSource,
        betaCountdown: readiness.betaCountdown,
        qualityLink: link,
        season: season.season,
        seasonIndex: season.index,
        checkLognormal: check,
        pool: poolUsageOf(phase4.pool, {
            norms: normsPool,
            edges: norms.edges,
            lagTable: lag.shrink.source === 'shrunk',
            seasonPooled: season.index.source === 'pooled',
            checkPrior: check.priorFromPool,
        }),
        readiness: {
            mode: readiness.mode,
            historyMonths: readiness.historyMonths,
            presentations: readiness.presentations,
            sales: readiness.sales,
            comparableFrom: readiness.comparableFrom,
            reasons: readiness.reasons,
            ...(input.readiness.calendarSource === undefined
                ? {}
                : { calendarSource: input.readiness.calendarSource }),
        },
        ...(stages === null
            ? {}
            : { readinessStages: stages, readinessStageGates: stageGates }),
        sanity: input.sanity,
        events: [...input.events],
        detectedEvents: [...input.detectedEvents],
        reused: false,
        reusedReason: null,
        signature: input.signature,
        meta: input.meta,
    };
}
