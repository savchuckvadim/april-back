/**
 * Сборка дневного прогноза менеджера (план Фазы 2, §4.8–§4.10, поток
 * 16a): срединная оценка месяца, наивные базы, ожидание от открытого
 * пайплайна, план на день, рычаги и утечки рёбер.
 *
 * Оркестрация готовых функций библиотеки: `pipelineExpected`,
 * `newFlowExpected`, `forecastP50`, `resolveTarget`, `requiredVolume`,
 * `unwindPaths`, `dailyPlan`, `decomposeFunnelGap`, `buildLevers`.
 * Собственных формул файл не держит.
 *
 * Главная честность здесь — `pipelineExpected: null` с причиной, когда
 * истории стадий нет: ноль означал бы «пайплайн пуст», а это неправда.
 *
 * Чистые функции: без DI и без `new Date()` — момент расчёта приходит в
 * `meta.generatedAt`, зерно сэмплирования — параметром.
 */
import {
    edgePosterior,
    decomposeFunnelGap,
    forecastP50,
    lagCdfFromTable,
    maturityFloor,
    meanMaturity,
    newFlowExpected,
    pipelineExpected,
    requiredVolume,
    resolveNumberParam,
    resolveTarget,
    type FunnelLeak,
} from '@lib/sales-ai-analytics';
import { AI_FORECAST_CI80_Z } from '../../constants/ai-portal-model.const';
import { buildPlan, leversOf, linkOf } from './forecast.plan';
import type { ForecastBuildInput, ForecastPayload } from './forecast.types';
import type {
    PortalManagerNorms,
    PortalModelPayload,
} from './portal-model.types';

export * from './forecast.types';

/** μ рёбер модели: код ребра → норма портала (она же θ пути). */
function edgeThetasOf(
    model: PortalModelPayload,
    norms: PortalManagerNorms | null,
): Record<string, number> {
    const thetas: Record<string, number> = {};
    for (const edge of model.edges) {
        thetas[edge.edge] = edge.mu;
    }
    for (const edge of norms?.edges ?? []) {
        thetas[edge.edge] = edge.mu;
    }

    return thetas;
}

/** Путь воронки: все рёбра модели в порядке справочника. */
const pathOf = (model: PortalModelPayload): string[] =>
    model.edges.map(edge => edge.edge);

/** Π θ по пути — конверсия входной активности в продажу. */
function conversionOf(
    thetas: Readonly<Record<string, number>>,
    edges: readonly string[],
): number {
    return edges.reduce((product, edge) => product * (thetas[edge] ?? 0), 1);
}

/**
 * 80 %-интервал «продаж на единицу активности»: интервал апостериора
 * входного ребра, пронесённый через фиксированные θ ниже по пути и
 * зрелость `F̄`. Без него рычаг объёма не выдаётся вовсе (правило §4.10).
 */
function salesPerUnitCi80(
    input: ForecastBuildInput,
    thetas: Readonly<Record<string, number>>,
    path: readonly string[],
    fBar: number,
): [number, number] | undefined {
    const entryCode = path[0];
    const entry = input.manager.edges.find(edge => edge.edge === entryCode);
    const norm = input.manager.norms?.edges.find(
        edge => edge.edge === entryCode,
    );
    if (entry === undefined || norm === undefined || entry.n <= 0) {
        return undefined;
    }
    const posterior = edgePosterior({
        successes: entry.s,
        exposure: entry.n,
        prior: { mu: norm.mu, kappa: norm.kappa },
        z: AI_FORECAST_CI80_Z,
    });
    if (posterior.ci90 === null) return undefined;
    const downstream = conversionOf(thetas, path.slice(1)) * fBar;

    return [posterior.ci90[0] * downstream, posterior.ci90[1] * downstream];
}

/** Утечки рёбер: вклад каждого ребра в недобор продаж (§4.5). */
function leaksOf(
    input: ForecastBuildInput,
    path: readonly string[],
): FunnelLeak[] {
    const byNorm = new Map(
        (input.manager.norms?.edges ?? []).map(edge => [edge.edge, edge]),
    );
    const edges = input.manager.edges.filter(edge => byNorm.has(edge.edge));
    if (edges.length === 0) return [];

    return decomposeFunnelGap({
        edges: edges.map(edge => ({
            code: edge.edge,
            successes: edge.s,
            exposure: edge.n,
            prior: {
                mu: byNorm.get(edge.edge)?.mu ?? 0,
                kappa: byNorm.get(edge.edge)?.kappa ?? 0,
            },
            volume: edge.n,
        })),
        paths: [
            {
                code: 'main',
                edges: path.filter(edge => byNorm.has(edge)),
            },
        ],
        seed: input.seed,
        qualityLink: linkOf(input.model),
    }).leaks.map(leak => ({ ...leak }));
}

/** Прогноз дня по менеджеру: числа, план, рычаги и утечки. */
export function buildForecastPayload(
    input: ForecastBuildInput,
): ForecastPayload {
    const { manager, model } = input;
    const cdf = lagCdfFromTable(model.lagCdf.points, {
        kind: model.lagCdf.kind,
        n: model.lagCdf.n,
    });
    const fMin = resolveNumberParam('f_min', input.registry);
    const maturity = meanMaturity(cdf, input.daysLeft);
    const fBar =
        fMin === undefined
            ? maturityFloor(maturity)
            : maturityFloor(maturity, fMin);
    const pipeline = pipelineExpected({
        episodes: manager.openEpisodes,
        cdf,
        daysRemaining: input.daysLeft,
        hasStageHistory: input.hasStageHistory,
    });
    const thetas = edgeThetasOf(model, manager.norms);
    const path = pathOf(model);
    const conversion = conversionOf(thetas, path);
    const entryRate =
        input.daysElapsed > 0 ? manager.entryDone / input.daysElapsed : 0;
    const newFlow = newFlowExpected({
        paths: [{ code: 'main', entryRate, conversion }],
        daysRemaining: input.daysLeft,
        fBar,
    });
    const forecast = forecastP50({
        doneSales: manager.doneSales,
        pipelineExpected: pipeline.value,
        newFlowExpected: newFlow,
        daysElapsed: input.daysElapsed,
        daysRemaining: input.daysLeft,
        lastMonthSales: manager.lastMonthSales,
    });
    const target = resolveTarget({
        planHead: manager.planHead,
        override: manager.override,
        levelTarget: manager.levelTarget,
    });
    const required = requiredVolume({
        target: target.value,
        doneSales: manager.doneSales,
        pipeline: pipeline.value,
        conversion,
        fBar,
        ...(fMin === undefined ? {} : { fMin }),
    });
    const leaks = leaksOf(input, path);
    const plan = buildPlan(
        input,
        thetas,
        path,
        { target: target.value, pipeline: pipeline.value },
        leaks,
    );

    return {
        day: input.day,
        monthKey: input.monthKey,
        p50: forecast.p50,
        descriptive: forecast.descriptive,
        naive: forecast.naive,
        naiveLastMonth: manager.lastMonthSales,
        pipelineExpected: pipeline.value,
        pipelineReason: pipeline.reason ?? null,
        newFlowExpected: newFlow,
        doneSales: manager.doneSales,
        target: {
            value: target.value,
            source: target.source,
            empty: target.empty,
        },
        requiredVolume: Number.isFinite(required) ? required : 0,
        daysElapsed: input.daysElapsed,
        daysLeft: input.daysLeft,
        plan,
        levers: leversOf(input, {
            entryRate,
            salesPerUnit: conversion * fBar,
            ci80: salesPerUnitCi80(input, thetas, path, fBar),
        }),
        leaks: [...leaks],
        meta: { ...input.meta, modelSnapshotId: input.modelSnapshotId },
    };
}
