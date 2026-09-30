/**
 * План на день и рычаги дневного прогноза (план Фазы 2, §4.9–§4.10,
 * поток 16a): разворот требуемого исхода по рёбрам воронки с потолком
 * дня и отбор рычагов.
 *
 * Вынесено из `forecast.assembler.ts` по лимиту 300 строк. Считают
 * готовые функции библиотеки (`unwindPaths`, `dailyPlan`, `buildLevers`,
 * `buildQualityLink`), здесь — только раскладка входов.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    buildLevers,
    buildQualityLink,
    dailyPlan,
    QAV_DEFAULTS,
    resolveNumberParam,
    unwindPaths,
    type DailyPlan,
    type FunnelLeak,
    type LeverCandidate,
    type QualityLeverInput,
    type QualityLink,
} from '@lib/sales-ai-analytics';
import {
    AI_FORECAST_LEVER_MAX,
    AI_FORECAST_QUALITY_DELTA,
} from '../../constants/ai-portal-model.const';
import { AI_QUALITY_LINK_OFFSET_EDGE } from '../../constants/ai-quality-link.const';
import type { ForecastBuildInput } from './forecast.types';
import type { PortalModelPayload } from './portal-model.types';

/** План на день: разворот требуемого исхода по рёбрам и потолок дня. */
export function buildPlan(
    input: ForecastBuildInput,
    thetas: Readonly<Record<string, number>>,
    path: readonly string[],
    goal: { target: number; pipeline: number | null },
    leaks: readonly FunnelLeak[],
): DailyPlan {
    const outcome = Math.max(
        0,
        goal.target - input.manager.doneSales - (goal.pipeline ?? 0),
    );
    const unwound = unwindPaths(outcome, thetas, [
        { code: 'main', edges: [...path] },
    ]);
    const done = new Map(
        input.manager.edges.map(edge => [edge.edge, edge.n] as const),
    );
    const leakOf = new Map(
        leaks.map(leak => [leak.edgeCode, leak.expected] as const),
    );
    const ceiling = resolveNumberParam('plan_day_ceiling', input.registry);

    return dailyPlan({
        items: unwound.map(edge => ({
            callType: edge.edge,
            edge: edge.edge,
            requiredRemaining: Number.isFinite(edge.required)
                ? edge.required
                : 0,
            doneMonth: done.get(edge.edge) ?? 0,
            cap: input.model.cap > 0 ? input.model.cap : null,
            leak: leakOf.get(edge.edge) ?? null,
        })),
        workdaysInMonth: input.workdaysInMonth,
        daysLeft: input.daysLeft,
        ...(ceiling === undefined ? {} : { ceilingMultiplier: ceiling }),
    });
}

/** Что нужно рычагам дня: объём, θ пути и зрелость `F̄`. */
export interface ForecastLeverContext {
    readonly entryRate: number;
    readonly salesPerUnit: number;
    readonly ci80: [number, number] | undefined;
    readonly thetas: Readonly<Record<string, number>>;
    readonly path: readonly string[];
    readonly fBar: number;
}

/**
 * Рычаги дня. Рычаг объёма выдаётся только с 80 %-интервалом эффекта
 * (правило §4.10): без интервала библиотека его отбросит — и это честнее
 * совета, опирающегося на одно число. Рычаг качества — только при связи
 * «по данным» (Фаза 4) и оценке менеджера; в режимах `none` и
 * `hypothesis` его нет вовсе.
 */
export function leversOf(
    input: ForecastBuildInput,
    context: ForecastLeverContext,
): LeverCandidate[] {
    const link = linkOf(input.model);
    const quality = qualityLeverOf(input, link, context);
    const minSectionCalls = resolveNumberParam(
        'lever_min_section_calls',
        input.registry,
    );

    return buildLevers({
        link,
        chainLinked: input.model.chainSharePct > 0,
        volume: {
            callType: input.model.capActivity,
            addedUnits: Math.max(0, context.entryRate),
            salesPerUnit: context.salesPerUnit,
            costMinutes: 0,
            ...(context.ci80 === undefined
                ? {}
                : { salesPerUnitCi80: context.ci80 }),
        },
        ...(quality === undefined ? {} : { quality }),
        evidence: {
            n: input.manager.entryDone,
            hasInterval: context.ci80 !== undefined,
        },
        ...(minSectionCalls === undefined ? {} : { minSectionCalls }),
        max: AI_FORECAST_LEVER_MAX,
    });
}

/**
 * Вход рычага качества: оценка менеджера за месяц, объём ребра
 * «презентация → КП» до конца месяца по темпу и `Π θ` ниже него с
 * зрелостью. Связь не применима, оценки нет, ребра нет в пути или месяц
 * только начался — рычага нет.
 */
export function qualityLeverOf(
    input: ForecastBuildInput,
    link: QualityLink,
    context: ForecastLeverContext,
): QualityLeverInput | undefined {
    const quality = input.manager.quality ?? null;
    const position = context.path.indexOf(AI_QUALITY_LINK_OFFSET_EDGE);
    if (
        !link.applied ||
        quality === null ||
        position < 0 ||
        input.daysElapsed <= 0
    ) {
        return undefined;
    }
    const delta = Math.min(
        AI_FORECAST_QUALITY_DELTA,
        QAV_DEFAULTS.sMax - quality.score,
    );
    if (!(delta > 0)) return undefined;
    const edge = input.manager.edges.find(
        item => item.edge === AI_QUALITY_LINK_OFFSET_EDGE,
    );
    const below = context.path
        .slice(position + 1)
        .reduce((product, code) => product * (context.thetas[code] ?? 0), 1);

    return {
        score: quality.score,
        delta,
        volume: ((edge?.n ?? 0) / input.daysElapsed) * input.daysLeft,
        downstream: below * context.fBar,
        sectionCalls: quality.n,
        coachingHours:
            resolveNumberParam('coaching_hours_section', input.registry) ?? 0,
    };
}

/**
 * Связь «качество → исход» модели портала. В режиме `data` — кривая
 * `p̂(S)` и наклон pooled-модели из снапшота модели (как в плане дня
 * руководителя, `daily-plan-rop.facts.ts`); в режимах `none` и
 * `hypothesis` кривой нет и множитель ровно 1.
 */
export function linkOf(model: PortalModelPayload): QualityLink {
    return buildQualityLink({
        betaSource: model.betaSource,
        sRef: model.sRef,
        ...(model.betaSource === 'data'
            ? {
                  curve: model.qualityLink?.curve ?? [],
                  beta: model.qualityLink?.pooled?.value ?? null,
              }
            : {}),
    });
}
