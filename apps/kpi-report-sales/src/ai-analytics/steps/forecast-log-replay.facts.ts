/**
 * Факты воспроизведения теневого журнала прогноза (шаг
 * `forecast-log-replay`), не зависящие от DI: закрыт ли месяц прогона,
 * какие дни восстанавливать, чтобы не затереть живые, открытые эпизоды
 * «в ночь на день d», продажи к дню по дате закрытия и темп входной
 * активности, известный к дню.
 *
 * Что восстанавливается точно (данные датированы): рабочие дни, продажи
 * (CLOSEDATE), открытые эпизоды (история стадий с границами), модель
 * портала с закрытым месяцем раньше M, факт прошлого месяца. Что
 * деградирует честно: темп входной активности — KPI по дням недоступен,
 * берётся темп ПРОШЛОГО месяца (известен к любому дню M); нет прошлого
 * месяца — средний темп самого месяца (единственный источник, с
 * оглядкой в будущее). Без истории стадий пайплайн — null с причиной, как
 * у живого прогноза.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()` внутри.
 */
import {
    daysBetween,
    toPortalDate,
    type ForecastLogDay,
    type ForecastLogSnapshot,
    type PipelineEpisode,
} from '@lib/sales-ai-analytics';
import type { AiTargets } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import type { ForecastManagerInput } from '../domain/assembler/forecast.types';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../domain/assembler/portal-model.types';
import type { ClosedSaleDay } from '../domain/loaders/closed-sales-days.loader';
import type { PortalModelRecord } from '../domain/loaders/portal-model.loader';

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null;

/** Месяц закрыт на момент прогона: ключ раньше текущего месяца портала. */
export function isMonthClosed(
    monthKey: string,
    now: Date,
    timeZone: string,
): boolean {
    return monthKey < toPortalDate(now, timeZone).slice(0, 7);
}

/** День журнала записан ночным прогоном, а не воспроизведён. */
export const isLiveDay = (day: ForecastLogDay): boolean =>
    day.replayed !== true;

/**
 * Какие рабочие дни восстанавливать: все, пока в журнале нет живых дней;
 * иначе — только раньше первого живого. Живые дни ночного прогона
 * неприкосновенны, прежние воспроизведённые переписываются.
 */
export function replayDaysOf(
    previous: ForecastLogSnapshot | null,
    workdays: readonly string[],
): string[] {
    const live = (previous?.days ?? [])
        .filter(isLiveDay)
        .map(day => day.day)
        .sort();
    const firstLive = live[0];

    return firstLive === undefined
        ? [...workdays]
        : workdays.filter(day => day < firstLive);
}

/** Модель портала с id записи — вход прогноза. */
export interface ReplayModel {
    readonly id: string | null;
    readonly payload: PortalModelPayload;
}

/** Модель портала пригодна для прогноза: в нагрузке есть рёбра. */
export function replayModelOf(
    record: PortalModelRecord | null,
): ReplayModel | null {
    return record !== null && Array.isArray(record.payload.edges)
        ? { id: record.id, payload: record.payload as PortalModelPayload }
        : null;
}

/** Эпизод сделки в объёме воспроизведения: ключ, стадия и границы. */
export interface ReplayEpisode {
    readonly key: string;
    readonly stageCode: string;
    /** Начало, ISO 8601. */
    readonly startedAt: string;
    /** Конец, ISO 8601; null — сделка открыта на день прогона. */
    readonly endedAt: string | null;
}

/**
 * Эпизоды из шины `episodes` (форма писателя — `DealEpisode` шага истории
 * стадий). Чужая или неполная форма отбрасывается: прогон не падает.
 */
export function replayEpisodesOf(value: unknown): ReplayEpisode[] {
    if (!Array.isArray(value)) return [];

    return (value as unknown[]).flatMap((item): ReplayEpisode[] => {
        if (
            !isObject(item) ||
            typeof item.key !== 'string' ||
            typeof item.stageCode !== 'string' ||
            typeof item.startedAt !== 'string' ||
            (item.endedAt !== null && typeof item.endedAt !== 'string')
        ) {
            return [];
        }

        return [
            {
                key: item.key,
                stageCode: item.stageCode,
                startedAt: item.startedAt,
                endedAt: item.endedAt,
            },
        ];
    });
}

/** Открытый на момент эпизод: ключ, стадия и возраст на этот момент. */
export interface OpenEpisodeAt {
    readonly key: string;
    readonly stageCode: string;
    readonly ageDays: number;
}

/**
 * Эпизоды, открытые на момент `at` (ISO): начались раньше, а закончились
 * позже либо не закончились. Возраст — от начала до `at`, а не до «сейчас».
 */
export function episodesOpenAt(
    episodes: readonly ReplayEpisode[],
    at: string,
): OpenEpisodeAt[] {
    return episodes.flatMap((episode): OpenEpisodeAt[] => {
        const age = daysBetween(episode.startedAt, at);
        if (age === null || age < 0) return [];
        if (episode.endedAt !== null) {
            const sinceEnd = daysBetween(episode.endedAt, at);
            if (sinceEnd === null || sinceEnd >= 0) return [];
        }

        return [
            { key: episode.key, stageCode: episode.stageCode, ageDays: age },
        ];
    });
}

/**
 * Пайплайн по менеджерам на момент: сцепка «эпизод → менеджер» (как у
 * живого прогноза — через звонки) и стадийные θ модели портала.
 */
export function pipelineByManager(
    open: readonly OpenEpisodeAt[],
    managerByKey: ReadonlyMap<string, string>,
    model: Pick<PortalModelPayload, 'stageTheta'>,
): Map<string, PipelineEpisode[]> {
    const theta = new Map(
        model.stageTheta.map(stage => [stage.stageCode, stage.value]),
    );
    const found = new Map<string, PipelineEpisode[]>();
    for (const episode of open) {
        const managerId = managerByKey.get(episode.key);
        if (managerId === undefined) continue;
        found.set(managerId, [
            ...(found.get(managerId) ?? []),
            {
                id: episode.key,
                ageDays: episode.ageDays,
                theta: theta.get(episode.stageCode) ?? 0,
            },
        ]);
    }

    return found;
}

/** Продаж менеджера, закрытых СТРОГО раньше дня (к ночи на день d). */
export function salesBefore(
    deals: readonly ClosedSaleDay[],
    day: string,
): Map<string, number> {
    const counts = new Map<string, number>();
    for (const deal of deals) {
        if (deal.closeDay >= day) continue;
        counts.set(deal.managerId, (counts.get(deal.managerId) ?? 0) + 1);
    }

    return counts;
}

/** Месяцы менеджера: сам месяц воспроизведения и прошлый. */
export interface ReplayManagerMonths {
    readonly current?: PortalManagerMonth;
    readonly previous?: PortalManagerMonth;
}

/** Месяцы по менеджерам (последняя запись менеджер-месяца побеждает). */
export function managerMonthsOf(
    months: readonly PortalManagerMonth[],
    monthKey: string,
    previousMonth: string,
): Map<string, ReplayManagerMonths> {
    const found = new Map<string, ReplayManagerMonths>();
    for (const month of months) {
        const own = found.get(month.managerId) ?? {};
        if (month.monthKey === monthKey) {
            found.set(month.managerId, { ...own, current: month });
        } else if (month.monthKey === previousMonth) {
            found.set(month.managerId, { ...own, previous: month });
        }
    }

    return found;
}

/** Что известно о темпе менеджера: прошлый месяц и месяц воспроизведения. */
export interface EntryRateOptions {
    readonly months: ReplayManagerMonths;
    /** Рабочих дней календаря в прошлом месяце. */
    readonly previousWorkdays: number;
    /** Рабочих дней календаря в месяце воспроизведения. */
    readonly workdays: number;
}

/**
 * Дневной темп входной активности, известный к дню: KPI прошлого месяца
 * на его рабочие дни. Прошлого месяца нет — средний темп самого месяца
 * (честная деградация с оглядкой в будущее — иначе остался бы ноль, то
 * есть «активности нет»).
 */
export function entryRateOf(options: EntryRateOptions): number {
    const { previous, current } = options.months;
    if (previous !== undefined && options.previousWorkdays > 0) {
        return previous.callsDone / options.previousWorkdays;
    }
    if (current !== undefined && options.workdays > 0) {
        return current.callsDone / options.workdays;
    }

    return 0;
}

/** Вход прогноза менеджера «в ночь на день d». */
export interface ReplayManagerInputOptions {
    readonly managerId: string;
    readonly months: ReplayManagerMonths;
    /** Продаж, закрытых раньше дня. */
    readonly doneSales: number;
    readonly entryRate: number;
    readonly daysElapsed: number;
    readonly openEpisodes: readonly PipelineEpisode[];
    readonly model: PortalModelPayload;
    readonly targets: AiTargets;
}

/**
 * Вход прогноза менеджера на день. Рёбра месяца, цель уровня и оценка
 * разборов не восстанавливаются: они влияют только на план дня, рычаги и
 * утечки, которых в журнале отдела нет; на P50, наивную базу и пайплайн —
 * не влияют.
 */
export function replayManagerInput(
    options: ReplayManagerInputOptions,
): ForecastManagerInput {
    const { current, previous } = options.months;

    return {
        managerId: options.managerId,
        doneSales: options.doneSales,
        entryDone: options.entryRate * options.daysElapsed,
        planHead: current?.planSales ?? null,
        override: options.targets.overrides[options.managerId] ?? null,
        levelTarget: null,
        lastMonthSales: previous?.salesCount ?? null,
        openEpisodes: options.openEpisodes,
        edges: [],
        norms:
            options.model.managerNorms.find(
                norm => norm.managerId === options.managerId,
            ) ?? null,
        quality: null,
    };
}
