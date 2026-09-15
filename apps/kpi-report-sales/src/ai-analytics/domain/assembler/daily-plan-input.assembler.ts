/**
 * Сборка входа ручки «план дня» из снапшотов (план Фазы 2, поток 17):
 * дневной прогноз + месячная модель портала + месяц менеджера → числа,
 * которые презентер раскладывает в DTO.
 *
 * Битрикс здесь не зовётся вовсе: всё уже лежит в `ais`. Своей математики
 * файл не держит — считают функции библиотеки (`resolveTarget`,
 * `targetSanity`, `dailyPlan`, `enumerateWorkdays`), служебные числа
 * руководителя — `daily-plan-rop.facts.ts`.
 *
 * Штатная деградация (§5.4) — часть контракта, а не аварийная ветка: нет
 * модели портала или прогноза → нормы не показываем, план дня считаем
 * ПО ОБЪЁМУ (снимок плана руководителя, иначе темп месяца) и возвращаем
 * причину; нет месяца менеджера → план пуст с причиной. Падать нельзя.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()`.
 */
import {
    AI_TARGET_SOURCES,
    dailyPlan,
    enumerateWorkdays,
    resolveTarget,
    targetSanity,
    type DailyPlan,
    type DailyPlanTypeInput,
    type TargetSource,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { monthBounds } from '../../constants/ai-manager-snapshot.const';
import { AI_ANALYTICS_FUNNEL_EDGES } from '../../constants/ai-overview.const';
import {
    AI_DAILY_PLAN_REASONS,
    AI_DAILY_PLAN_WARNINGS,
} from '../../constants/ai-plan.const';
import { buildDailyPlanRopFacts } from './daily-plan-rop.facts';
import type {
    DailyPlanAssembleInput,
    DailyPlanSnapshots,
    DailyPlanTargetFacts,
    DailyPlanView,
    DailyPlanWorkdays,
} from './daily-plan-input.types';
import type { ForecastPayload } from './forecast.types';
import type {
    ManagerMonthPayload,
    ManagerPlanSnapshot,
} from './manager-snapshot.types';
import { AI_MONTH_KPI_CODES } from './manager-month.facts';

export * from './daily-plan-input.types';

/** Коды KPI-вектора, по которым снимок плана руководителя ложится на рёбра. */
type MonthKpiCode = (typeof AI_MONTH_KPI_CODES)[number];
const KPI_CALLS: MonthKpiCode = 'call_done';
const KPI_PRESENTATIONS: MonthKpiCode = 'presentation_uniq_done';

const numberOf = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nullableNumberOf = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const isTargetSource = (value: unknown): value is TargetSource =>
    typeof value === 'string' &&
    (AI_TARGET_SOURCES as readonly string[]).includes(value);

/** Рабочие дни месяца по календарю портала относительно дня плана. */
export function planWorkdays(
    monthKey: string,
    day: string,
    calendar: WorkCalendar,
): DailyPlanWorkdays {
    const bounds = monthBounds(monthKey);
    const days = enumerateWorkdays(bounds.from, bounds.to, calendar);

    return {
        total: days.length,
        elapsed: days.filter(item => item < day).length,
        left: days.filter(item => item >= day).length,
    };
}

/** План месяца из снимка руководителя по полюсу ребра; null — плана нет. */
function plannedOf(
    edgeCode: string,
    plan: ManagerPlanSnapshot | null,
): number | null {
    if (plan === null) return null;
    const definition = AI_ANALYTICS_FUNNEL_EDGES.find(
        edge => edge.code === edgeCode,
    );
    if (definition === undefined) return null;
    if (definition.from === KPI_CALLS) return nullableNumberOf(plan.calls);

    return definition.from === KPI_PRESENTATIONS
        ? nullableNumberOf(plan.presentations)
        : null;
}

/**
 * План ПО ОБЪЁМУ — деградация §5.4: норм и прогноза нет, поэтому объём
 * остатка месяца берётся из снимка плана руководителя, а без него — из
 * темпа уже отработанных дней. Ни норм, ни качества здесь нет вовсе.
 */
export function planByVolume(
    month: Partial<ManagerMonthPayload> | null,
    days: DailyPlanWorkdays,
    ceilingMultiplier?: number,
): DailyPlan {
    const plan = month?.planSnapshot ?? null;
    const items: DailyPlanTypeInput[] = (month?.edges ?? []).map(edge => {
        const doneMonth = numberOf(edge.n);
        const planned = plannedOf(edge.edge, plan);
        const pace =
            days.elapsed > 0 ? (doneMonth / days.elapsed) * days.left : 0;

        return {
            callType: edge.edge,
            edge: edge.edge,
            requiredRemaining:
                planned === null ? pace : Math.max(0, planned - doneMonth),
            doneMonth,
            cap: null,
        };
    });

    return dailyPlan({
        items,
        workdaysInMonth: days.total,
        daysLeft: days.left,
        ...(ceilingMultiplier === undefined ? {} : { ceilingMultiplier }),
    });
}

/** Цель месяца: из прогноза, иначе каскадом по месяцу и настройкам. */
function targetOf(
    input: DailyPlanAssembleInput,
    days: DailyPlanWorkdays,
): DailyPlanTargetFacts {
    const { forecast, model, month } = input.snapshots;
    const fromForecast = forecast?.target;
    const level = typeof month?.level === 'string' ? month.level : null;
    const byLevel = input.targets.byLevel as Record<
        string,
        { sales: number | null } | undefined
    >;
    const resolved =
        fromForecast === undefined
            ? resolveTarget({
                  planHead: nullableNumberOf(month?.planSnapshot?.sales),
                  override: input.targets.overrides[input.managerId] ?? null,
                  levelTarget:
                      level === null ? null : (byLevel[level]?.sales ?? null),
              })
            : {
                  value: numberOf(fromForecast.value),
                  source: isTargetSource(fromForecast.source)
                      ? fromForecast.source
                      : 'median',
                  empty: fromForecast.empty === true,
              };
    const sanity = targetSanity({
        target: resolved.value,
        cap: nullableNumberOf(model?.cap),
        workdays: days.total,
    });

    return {
        value: resolved.value,
        source: resolved.source,
        warnings: resolved.empty
            ? [AI_DAILY_PLAN_WARNINGS.targetEmpty, ...sanity.flags]
            : [...sanity.flags],
    };
}

/** План ночного прогноза, если он записан в снапшоте; иначе null. */
function planOfForecast(
    forecast: Partial<ForecastPayload> | null,
): DailyPlan | null {
    const plan = forecast?.plan;

    return plan !== undefined && Array.isArray(plan.items) ? plan : null;
}

/** Код деградации: модель важнее прогноза, прогноз важнее месяца. */
function reasonOf(
    snapshots: DailyPlanSnapshots,
    hasPlan: boolean,
): string | null {
    if (snapshots.model === null) return AI_DAILY_PLAN_REASONS.modelMissing;
    if (!hasPlan) return AI_DAILY_PLAN_REASONS.forecastMissing;
    if (snapshots.month === null) return AI_DAILY_PLAN_REASONS.monthMissing;

    return null;
}

/**
 * План дня по снапшотам. Прогноз за день есть — берутся его план и его
 * числа (их посчитал ночной конвейер теми же функциями библиотеки);
 * прогноза нет — план по объёму с кодом причины.
 */
export function buildDailyPlanView(
    input: DailyPlanAssembleInput,
): DailyPlanView {
    const days = planWorkdays(input.monthKey, input.date, input.calendar);
    const { forecast, month } = input.snapshots;
    const forecastPlan = planOfForecast(forecast);
    const plan =
        forecastPlan ?? planByVolume(month, days, input.ceilingMultiplier);
    const target = targetOf(input, days);
    const doneSales =
        forecastPlan === null
            ? numberOf(month?.finance?.salesCount)
            : numberOf(forecast?.doneSales);
    const pipeline =
        forecastPlan === null
            ? null
            : nullableNumberOf(forecast?.pipelineExpected);
    const required =
        forecastPlan === null ? 0 : numberOf(forecast?.requiredVolume);

    return {
        managerId: input.managerId,
        date: input.date,
        monthKey: input.monthKey,
        target,
        doneSales,
        pipelineExpected: pipeline,
        requiredVolume: forecastPlan === null ? null : required,
        volumeBased: forecastPlan === null,
        daysLeft:
            forecastPlan === null
                ? days.left
                : numberOf(forecast?.daysLeft, days.left),
        daysElapsed: days.elapsed,
        workdaysInMonth: days.total,
        plan,
        reason: reasonOf(input.snapshots, forecastPlan !== null),
        rop: buildDailyPlanRopFacts(input, days, plan, {
            doneSales,
            pipeline,
            required,
            target: target.value,
        }),
    };
}
