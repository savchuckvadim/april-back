/**
 * Сборка воспроизведённого теневого журнала прогноза отдела (шаг
 * `forecast-log-replay`): для каждого рабочего дня d закрытого месяца —
 * прогноз каждого менеджера «как в ночь на d» теми же функциями, что у
 * живого прогноза (`buildForecastPayload`), сумма отдела тем же
 * `buildForecastLogDay`, затем слияние с живыми днями журнала.
 *
 * Момент дня d — начало суток портала: ночной прогон идёт до рабочего
 * дня, поэтому к нему известны продажи и эпизоды до конца d − 1, а сам
 * d входит в оставшиеся дни (как `workdaysOf` живого прогноза).
 *
 * Чистые функции: без DI, Bitrix и `new Date()`; случайность — только
 * seed `seedOf(domain, …, calcVersion)`, те же зёрна, что ночью.
 */
import {
    enumerateWorkdays,
    NEGBIN_DEFAULTS,
    resolveNumberParam,
    seedOf,
    type AiSnapshotMeta,
    type ForecastLogDay,
    type ForecastLogSnapshot,
    type LognormalCheckSource,
    type ParamContext,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import type { AiTargets } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { monthBounds } from '../constants/ai-manager-snapshot.const';
import { previousMonthKey } from '../constants/ai-snapshot.const';
import {
    buildForecastLogDay,
    managerPointOf,
} from '../domain/assembler/department-forecast.assembler';
import { buildForecastPayload } from '../domain/assembler/forecast.assembler';
import type { PortalManagerMonth } from '../domain/assembler/portal-model.types';
import type { ClosedSaleDay } from '../domain/loaders/closed-sales-days.loader';
import { portalRangeUtc } from '../domain/loaders/period.util';
import {
    mean3MonthKeys,
    mean3Of,
    modelFactsOf,
    rosterMonthSales,
    type DepartmentModelFacts,
} from './department-forecast.facts';
import { workdayCountersAt } from './forecast.facts';
import {
    entryRateOf,
    episodesOpenAt,
    isLiveDay,
    managerMonthsOf,
    pipelineByManager,
    replayManagerInput,
    salesBefore,
    type ReplayEpisode,
    type ReplayManagerMonths,
    type ReplayModel,
} from './forecast-log-replay.facts';

/** Вход сборки журнала месяца по истории. */
export interface ReplayLogInput {
    readonly domain: string;
    readonly monthKey: string;
    readonly timeZone: string;
    readonly calendar: WorkCalendar;
    /** Все рабочие дни месяца по возрастанию. */
    readonly workdays: readonly string[];
    /** Какие из них восстанавливать (см. `replayDaysOf`). */
    readonly days: readonly string[];
    readonly roster: readonly string[];
    readonly model: ReplayModel;
    /** Месяцы менеджеров: сам месяц, прошлый и окно простого среднего. */
    readonly months: readonly PortalManagerMonth[];
    readonly closeDays: readonly ClosedSaleDay[];
    readonly episodes: readonly ReplayEpisode[];
    /** Сцепка «ключ эпизода → менеджер» (через звонки, как ночью). */
    readonly managerByEpisodeKey: ReadonlyMap<string, string>;
    /** История стадий нужной глубины есть; false → пайплайн null. */
    readonly hasStageHistory: boolean;
    readonly registry: ParamContext;
    readonly targets: AiTargets;
    readonly calcVersion: string;
    /** Журнал месяца из `ais`; null — журнала ещё нет. */
    readonly previous: ForecastLogSnapshot | null;
    /** Факт продаж месяца (как ставит бэктест); null — факта нет. */
    readonly actual: number | null;
    readonly meta: AiSnapshotMeta;
}

/** Общее для всех дней месяца: модель, темпы, среднее, рабочие дни. */
interface ReplayShared {
    readonly input: ReplayLogInput;
    readonly facts: DepartmentModelFacts;
    readonly level: number;
    readonly sums: ReadonlyMap<string, number>;
    readonly managerMonths: ReadonlyMap<string, ReplayManagerMonths>;
    readonly previousWorkdays: number;
}

const byDay = (left: ForecastLogDay, right: ForecastLogDay): number =>
    left.day < right.day ? -1 : left.day > right.day ? 1 : 0;

/** Момент «ночь на день d»: начало суток портала, ISO. */
export function replayInstantOf(day: string, timeZone: string): string {
    return portalRangeUtc(day, day, timeZone).from.toISOString();
}

/** День журнала «как в ночь на d» с пометкой о воспроизведении. */
function buildReplayDay(day: string, shared: ReplayShared): ForecastLogDay {
    const { input } = shared;
    const counters = workdayCountersAt(input.workdays, day);
    const pipeline = pipelineByManager(
        episodesOpenAt(input.episodes, replayInstantOf(day, input.timeZone)),
        input.managerByEpisodeKey,
        input.model.payload,
    );
    const done = salesBefore(input.closeDays, day);
    const managers = input.roster.map(managerId => {
        const months = shared.managerMonths.get(managerId) ?? {};
        const payload = buildForecastPayload({
            day,
            monthKey: input.monthKey,
            workdaysInMonth: counters.total,
            daysElapsed: counters.elapsed,
            daysLeft: counters.left,
            model: input.model.payload,
            modelSnapshotId: input.model.id,
            hasStageHistory: input.hasStageHistory,
            registry: input.registry,
            manager: replayManagerInput({
                managerId,
                months,
                doneSales: done.get(managerId) ?? 0,
                entryRate: entryRateOf({
                    months,
                    previousWorkdays: shared.previousWorkdays,
                    workdays: counters.total,
                }),
                daysElapsed: counters.elapsed,
                openEpisodes: pipeline.get(managerId) ?? [],
                model: input.model.payload,
                targets: input.targets,
            }),
            seed: seedOf(input.domain, managerId, day, input.calcVersion),
            meta: { ...input.meta, modelSnapshotId: input.model.id },
        });

        return managerPointOf(managerId, payload);
    });
    const logDay = buildForecastLogDay({
        day,
        managers,
        phi: shared.facts.phi,
        phiSource: shared.facts.phiSource,
        level: shared.level,
        check: shared.facts.check,
        seed: seedOf(input.domain, day, input.calcVersion),
        mean3: mean3Of(shared.sums, mean3MonthKeys(day)),
        modelSnapshotId: input.model.id,
    });

    return { ...logDay, replayed: true };
}

/** Вход слияния воспроизведённых дней с журналом месяца. */
export interface ReplayMergeInput {
    readonly monthKey: string;
    readonly previous: ForecastLogSnapshot | null;
    readonly days: readonly ForecastLogDay[];
    readonly actual: number | null;
    readonly checkSource: LognormalCheckSource | null;
    readonly meta: AiSnapshotMeta;
}

/**
 * Журнал месяца: живые дни ночного прогона остаются как есть (при
 * совпадении дня живой побеждает), прежние воспроизведённые заменяются
 * новыми, дни — по возрастанию. Факт — переданный, иначе прежний.
 * Источник последней записи — `replay`.
 */
export function mergeReplayedLog(input: ReplayMergeInput): ForecastLogSnapshot {
    const live = (input.previous?.days ?? []).filter(isLiveDay);
    const liveDays = new Set(live.map(day => day.day));
    const replayed = input.days.filter(day => !liveDays.has(day.day));

    return {
        monthKey: input.monthKey,
        days: [...live, ...replayed].sort(byDay),
        actual: input.actual ?? input.previous?.actual ?? null,
        checkSource: input.checkSource,
        meta: { ...input.meta, source: 'replay' },
    };
}

/** Журнал месяца, восстановленный по истории, слитый с живыми днями. */
export function buildReplayLog(input: ReplayLogInput): ForecastLogSnapshot {
    const previousMonth = previousMonthKey(`${input.monthKey}-01`);
    const bounds = monthBounds(previousMonth);
    const shared: ReplayShared = {
        input,
        facts: modelFactsOf(input.model.payload, input.registry),
        level:
            resolveNumberParam('forecast_interval_level', input.registry) ??
            NEGBIN_DEFAULTS.level,
        sums: rosterMonthSales(input.months, input.roster),
        managerMonths: managerMonthsOf(
            input.months,
            input.monthKey,
            previousMonth,
        ),
        previousWorkdays: enumerateWorkdays(
            bounds.from,
            bounds.to,
            input.calendar,
        ).length,
    };

    return mergeReplayedLog({
        monthKey: input.monthKey,
        previous: input.previous,
        days: input.days.map(day => buildReplayDay(day, shared)),
        actual: input.actual,
        checkSource: shared.facts.check.source,
        meta: input.meta,
    });
}
