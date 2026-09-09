/**
 * План на день и рычаги дневного прогноза (план Фазы 2, §4.9–§4.10,
 * поток 16a): разворот требуемого исхода по рёбрам воронки с потолком
 * дня и отбор рычагов.
 *
 * Вынесено из `forecast.assembler.ts` по лимиту 300 строк. Считают
 * готовые функции библиотеки (`unwindPaths`, `dailyPlan`, `buildLevers`),
 * здесь — только раскладка входов.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    buildLevers,
    dailyPlan,
    resolveNumberParam,
    unwindPaths,
    type DailyPlan,
    type FunnelLeak,
    type LeverCandidate,
    type QualityLink,
} from '@lib/sales-ai-analytics';
import { AI_FORECAST_LEVER_MAX } from '../../constants/ai-portal-model.const';
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

/**
 * Рычаги дня. Рычаг объёма выдаётся только с 80 %-интервалом эффекта
 * (правило §4.10): без интервала библиотека его отбросит — и это честнее
 * совета, опирающегося на одно число. Рычаг качества в режимах `none` и
 * `hypothesis` не выдаётся вовсе.
 */
export function leversOf(
    input: ForecastBuildInput,
    volume: {
        entryRate: number;
        salesPerUnit: number;
        ci80: [number, number] | undefined;
    },
): LeverCandidate[] {
    return buildLevers({
        link: linkOf(input.model),
        chainLinked: input.model.chainSharePct > 0,
        volume: {
            callType: input.model.capActivity,
            addedUnits: Math.max(0, volume.entryRate),
            salesPerUnit: volume.salesPerUnit,
            costMinutes: 0,
            ...(volume.ci80 === undefined
                ? {}
                : { salesPerUnitCi80: volume.ci80 }),
        },
        evidence: {
            n: input.manager.entryDone,
            hasInterval: volume.ci80 !== undefined,
        },
        max: AI_FORECAST_LEVER_MAX,
    });
}

/**
 * Связь «качество → исход» вне режима `data`: множитель ровно 1.
 * Прикладные величины (множитель, изо-линия, `S_req`) в Фазе 2
 * недоступны — оценка β появляется только в Фазе 4.
 */
export function linkOf(model: PortalModelPayload): QualityLink {
    return {
        betaSource: model.betaSource,
        sRef: model.sRef,
        curve: [],
        pRef: null,
        beta: null,
        hypothesisBeta: null,
        rareOutcomeOnly: false,
        applied: false,
        reason: model.betaSource === 'none' ? 'no-beta' : 'hypothesis-only',
    };
}
