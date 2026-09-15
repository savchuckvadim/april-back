/**
 * Служебные числа руководителя в плане дня (план Фазы 2, §4.9, поток 17):
 * норма входного ребра, связь «качество → исход», два `G′` (ожидание по
 * медиане темпа и потолок по capacity) и связующее ограничение.
 *
 * Отделено от `daily-plan-input.assembler.ts` по лимиту 300 строк
 * (прецедент — `steps/forecast.facts.ts`). Считают функции библиотеки:
 * `buildQualityLink`, `requiredQualityFor`, `ceilingForecast`,
 * `bindingConstraint`, `confidenceFor`; своей математики файл не держит.
 *
 * ⚠ В режимах `none` и `hypothesis` связи качества нет по построению:
 * `normAtRefQuality` и `sReq` равны null, а множитель качества в план не
 * попадает вовсе — план дня от качества не зависит.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()`.
 */
import {
    bindingConstraint,
    buildQualityLink,
    ceilingForecast,
    confidenceFor,
    lagCdfFromTable,
    maturityFloor,
    meanMaturity,
    requiredQualityFor,
    type AiBetaSource,
    type DailyPlan,
    type MetricValue,
} from '@lib/sales-ai-analytics';
import { AI_DAILY_PLAN_UNREACHABLE } from '../../constants/ai-plan.const';
import type {
    DailyPlanAssembleInput,
    DailyPlanRopFacts,
    DailyPlanWorkdays,
} from './daily-plan-input.types';
import type {
    PortalManagerNorms,
    PortalModelPayload,
} from './portal-model.types';

/** Числа цели, уже посчитанные сборкой плана. */
export interface DailyPlanGoal {
    /** `Y₀` — закрытые продажи месяца. */
    readonly doneSales: number;
    /** `λ_pipe`; null — истории стадий нет. */
    readonly pipeline: number | null;
    /** `N_req` — требуемый объём входной активности. */
    readonly required: number;
    /** `G` — цель месяца. */
    readonly target: number;
}

const numberOf = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** θ рёбер модели с приоритетом норм менеджера — как в ночном прогнозе. */
function thetasOf(
    model: Partial<PortalModelPayload> | null,
    norms: PortalManagerNorms | null,
): Record<string, number> {
    const thetas: Record<string, number> = {};
    for (const edge of model?.edges ?? []) {
        thetas[edge.edge] = numberOf(edge.mu);
    }
    for (const edge of norms?.edges ?? []) {
        thetas[edge.edge] = numberOf(edge.mu);
    }

    return thetas;
}

/** Норма входного ребра менеджера как метрика витрины. */
export function normMetricOf(norms: PortalManagerNorms | null): MetricValue {
    const edge = norms?.edges[0];
    if (edge === undefined) {
        return { value: null, n: 0, confidence: confidenceFor(0, 'rate') };
    }
    const n = numberOf(edge.n);
    const confidence = confidenceFor(n, 'rate');

    return {
        value: confidence.level === 'none' ? null : numberOf(edge.mu),
        n,
        w: numberOf(edge.w),
        confidence,
    };
}

/** Почему цель недостижима: θ = 0 в развороте, нет дней либо потолок. */
export function unreachableOf(
    plan: DailyPlan,
    binding: { readonly edge: string | null; readonly unreachable: boolean },
    daysLeft: number,
): string | null {
    if (plan.items.some(item => item.unreachable)) {
        return AI_DAILY_PLAN_UNREACHABLE.edgeThetaZero;
    }
    if (!binding.unreachable) return null;

    return daysLeft <= 0
        ? AI_DAILY_PLAN_UNREACHABLE.noDaysLeft
        : AI_DAILY_PLAN_UNREACHABLE.capExceeded;
}

/**
 * `Π θ` от входной активности до продажи и средняя зрелость `F̄(D_rem)` —
 * два множителя, которыми объём превращается в продажи.
 */
function conversionOf(
    model: Partial<PortalModelPayload> | null,
    norms: PortalManagerNorms | null,
    daysLeft: number,
): { conversion: number; fBar: number; entryEdge: string | undefined } {
    const thetas = thetasOf(model, norms);
    const path = (model?.edges ?? []).map(edge => edge.edge);
    const cdf = lagCdfFromTable(model?.lagCdf?.points ?? [], {
        ...(model?.lagCdf?.kind === undefined
            ? {}
            : { kind: model.lagCdf.kind }),
        n: numberOf(model?.lagCdf?.n),
    });

    return {
        conversion: path.reduce(
            (product, edge) => product * (thetas[edge] ?? 0),
            1,
        ),
        fBar: maturityFloor(meanMaturity(cdf, daysLeft)),
        entryEdge: path[0],
    };
}

/**
 * Числа руководителя по снапшотам. Модели портала нет — нормы пусты,
 * режим `none`, оба `G′` равны уже достигнутому: врать про потолок,
 * которого никто не считал, нельзя (§5.4).
 */
export function buildDailyPlanRopFacts(
    input: DailyPlanAssembleInput,
    days: DailyPlanWorkdays,
    plan: DailyPlan,
    goal: DailyPlanGoal,
): DailyPlanRopFacts {
    const { model, month } = input.snapshots;
    const norms =
        model?.managerNorms?.find(item => item.managerId === input.managerId) ??
        null;
    const betaSource: AiBetaSource = model?.betaSource ?? 'none';
    const link = buildQualityLink({
        betaSource,
        ...(model?.sRef === undefined ? {} : { sRef: model.sRef }),
    });
    const { conversion, fBar, entryEdge } = conversionOf(
        model,
        norms,
        days.left,
    );
    const entry = (month?.edges ?? []).find(edge => edge.edge === entryEdge);
    const cap = numberOf(model?.cap) > 0 ? numberOf(model?.cap) : null;
    const ceiling = ceilingForecast({
        doneSales: goal.doneSales,
        pipelineExpected: goal.pipeline,
        daysRemaining: days.left,
        expectedRate: days.elapsed > 0 ? numberOf(entry?.n) / days.elapsed : 0,
        cap,
        conversion,
        fBar,
    });
    const binding = bindingConstraint(
        plan.items.map(item => ({
            edge: item.callType,
            required: Math.max(0, item.monthPlan - item.monthDone),
        })),
        {
            byEdge: Object.fromEntries(
                plan.items.map(item => [item.callType, item.cap]),
            ),
            daysRemaining: days.left,
        },
    );

    return {
        norm: normMetricOf(norms),
        normAtRefQuality: link.pRef,
        betaSource,
        bindingConstraint: binding.edge,
        unreachable: unreachableOf(plan, binding, days.left),
        gExpected: ceiling.expected,
        gCeiling: ceiling.ceiling,
        sReq: requiredQualityFor(
            link,
            goal.required,
            Math.max(0, goal.target - goal.doneSales - (goal.pipeline ?? 0)),
        ).sReq,
    };
}
