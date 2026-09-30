/**
 * Сборка выборки «звонок-триггер → ближний исход» (план `ai-sales-analytics`,
 * §4.4 «единица — звонок-триггер»).
 *
 * Триггер — первый по времени звонок типа «презентация» внутри эпизода;
 * остальные звонки эпизода уходят в счётчик `callsInEpisode` (контроль
 * `γ·log(1 + calls_i)`), вторые и дальнейшие презентации в выборку не
 * входят (двойного счёта эпизода нет). `S_i^form` — среднее оценок
 * разделов «формы» (`quality_form_sections`) с relevance > 0; без них —
 * общий балл разбора/10 (`qualityScoreOfCall`); без того и другого звонок
 * пропускается. Предикторы Мундлака центрируются по менеджеру (`S̄_m`)
 * и порталу (`S̄_p`); лид плацебо `S̄_{m,w+k}` — среднее S менеджера через
 * `beta_placebo_lead_weeks` недель.
 *
 * Чистая математика: время только параметром `now`, порядок строк —
 * (момент звонка, callId), суммы в фиксированном порядке.
 */
import { registryDefault } from '../params/registry.access';
import { csvItems } from '../params/registry.validate';
import {
    type TimedCall,
    compareTimedCalls,
    defaultLeadKindOf,
    emptyDropped,
    formScoreOfCall,
    meanOf,
    betaMonthKeyOf,
    weekIndexOf,
    weeklyMeans,
} from './beta-sample.score';
import {
    AI_BETA_LEAD_KINDS,
    AI_BETA_TRIGGER_CALL_TYPE,
    type AiBetaDropReason,
    type AiBetaLeadKind,
    type BetaSample,
    type BetaSampleCall,
    type BetaSampleParams,
    type BetaSampleRow,
    type BetaSampleSeed,
} from './beta-sample.types';
import {
    type DealEpisode,
    type EpisodesByEntity,
    parseInstant,
} from './episode';
import type { CallLink } from './episode-link.types';
import { NEAR_OUTCOME_DEFAULTS, nearOutcomeOf } from './near-outcome';

export * from './beta-sample.types';
export {
    defaultLeadKindOf,
    formScoreOfCall,
    betaMonthKeyOf,
    type FormScore,
} from './beta-sample.score';

/** Дефолты сборки — из реестра и словаря ближнего исхода. */
export const BETA_SAMPLE_DEFAULTS = {
    /** `quality_form_sections` — состав «формы». */
    formSections: csvItems(registryDefault('quality_form_sections')),
    /** `lag_window_near_days` — окно ближнего исхода. */
    windowDays: NEAR_OUTCOME_DEFAULTS.windowDays,
    /** `beta_placebo_lead_weeks` — сдвиг лида плацебо. */
    leadWeeks: registryDefault('beta_placebo_lead_weeks'),
    /** Тип звонка-триггера — «презентация». */
    triggerCallType: AI_BETA_TRIGGER_CALL_TYPE,
} as const;

/** Вход сборки: звонки, сцепки и эпизоды по сущностям. */
export interface BetaSampleInput {
    readonly calls: readonly BetaSampleCall[];
    readonly links: readonly CallLink[];
    readonly episodesByEntity: EpisodesByEntity;
    readonly params: BetaSampleParams;
}

interface EpisodeGroup {
    readonly episode: DealEpisode;
    readonly entityEpisodes: readonly DealEpisode[];
    readonly calls: TimedCall[];
}

/**
 * Строки выборки из семян: центрирование по менеджеру и порталу,
 * `log(1 + calls)`, агрегаты. Семена сортируются по (at, callId).
 */
export function assembleBetaSample(
    seeds: readonly BetaSampleSeed[],
    meta: {
        readonly dropped?: Readonly<Record<AiBetaDropReason, number>>;
        readonly windowDays?: number;
        readonly formSections?: readonly string[];
    } = {},
): BetaSample {
    const ordered = seeds
        .map(seed => ({ seed, ms: parseInstant(seed.at) ?? 0 }))
        .sort(
            (a, b) => a.ms - b.ms || a.seed.callId.localeCompare(b.seed.callId),
        )
        .map(item => item.seed);
    const byManager = new Map<string, number[]>();
    ordered.forEach(seed => {
        const scores = byManager.get(seed.managerId) ?? [];
        scores.push(seed.score);
        byManager.set(seed.managerId, scores);
    });
    const managerIds = [...byManager.keys()].sort((a, b) => a.localeCompare(b));
    const sBarByManager: Record<string, number> = {};
    managerIds.forEach(managerId => {
        sBarByManager[managerId] = meanOf(byManager.get(managerId) ?? [0]);
    });
    const sBarPortal =
        ordered.length > 0 ? meanOf(ordered.map(seed => seed.score)) : 0;
    const rows: BetaSampleRow[] = ordered.map(seed => ({
        ...seed,
        sWithin: seed.score - sBarByManager[seed.managerId],
        sBetween: sBarByManager[seed.managerId] - sBarPortal,
        sCentered: seed.score - sBarPortal,
        logCalls: Math.log(1 + Math.max(0, seed.callsInEpisode)),
    }));
    const present = new Set(rows.map(row => row.stratum));

    return {
        rows,
        dropped: meta.dropped ?? emptyDropped(),
        n: rows.length,
        events: rows.filter(row => row.outcome === 1).length,
        managers: managerIds.length,
        strata: AI_BETA_LEAD_KINDS.filter(kind => present.has(kind)),
        sBarPortal,
        sBarByManager,
        windowDays: meta.windowDays ?? BETA_SAMPLE_DEFAULTS.windowDays,
        formSections: meta.formSections ?? BETA_SAMPLE_DEFAULTS.formSections,
    };
}

/** Группы «эпизод → звонки» по сцепкам; несцепленные — в `dropped`. */
function groupByEpisode(
    calls: readonly TimedCall[],
    links: readonly CallLink[],
    episodesByEntity: EpisodesByEntity,
    dropped: Record<AiBetaDropReason, number>,
): Map<string, EpisodeGroup> {
    const linkById = new Map(links.map(link => [link.callId, link]));
    const groups = new Map<string, EpisodeGroup>();
    calls.forEach(timed => {
        const link = linkById.get(timed.call.callId);
        if (
            !link ||
            link.confidence === 'none' ||
            link.dealId === null ||
            link.episodeKey === null
        ) {
            dropped['no-link'] += 1;

            return;
        }
        const entityEpisodes = episodesByEntity[link.dealId] ?? [];
        const episode = entityEpisodes.find(
            item => item.key === link.episodeKey,
        );
        if (!episode) {
            dropped['no-episode'] += 1;

            return;
        }
        const group = groups.get(episode.key) ?? {
            episode,
            entityEpisodes,
            calls: [],
        };
        group.calls.push(timed);
        groups.set(episode.key, group);
    });

    return groups;
}

/**
 * Выборка «звонок-триггер → ближний исход» из звонков, сцепок и эпизодов
 * (план §4.4). Ничего не грузит: все структуры приходят от приложения.
 */
export function buildBetaSample(input: BetaSampleInput): BetaSample {
    const { params } = input;
    const formSections =
        params.formSections ?? BETA_SAMPLE_DEFAULTS.formSections;
    const trigger =
        params.presentationCallType ?? BETA_SAMPLE_DEFAULTS.triggerCallType;
    const windowDays = params.windowDays ?? BETA_SAMPLE_DEFAULTS.windowDays;
    const leadWeeks = Math.round(
        params.leadWeeks ?? BETA_SAMPLE_DEFAULTS.leadWeeks,
    );
    const leadKindOf = params.leadKindOf ?? defaultLeadKindOf;
    const dropped = emptyDropped();
    const timed: TimedCall[] = [];
    input.calls.forEach(call => {
        const ms = parseInstant(call.at);
        if (ms === null) {
            dropped['bad-time'] += 1;
        } else {
            timed.push({ call, ms });
        }
    });
    timed.sort(compareTimedCalls);
    const weekly = weeklyMeans(timed, formSections);
    const groups = groupByEpisode(
        timed,
        input.links,
        input.episodesByEntity,
        dropped,
    );
    const seeds: BetaSampleSeed[] = [];
    groups.forEach(group => {
        const first = group.calls.find(item => item.call.callType === trigger);
        group.calls.forEach(item => {
            if (item !== first) {
                const reason: AiBetaDropReason =
                    item.call.callType === trigger ? 'not-trigger' : 'control';
                dropped[reason] += 1;
            }
        });
        if (!first) {
            return;
        }
        const form = formScoreOfCall(first.call, formSections);
        if (form === null) {
            dropped['no-score'] += 1;

            return;
        }
        const outcome = nearOutcomeOf(group.episode, first.call.at, {
            now: params.now,
            windowDays,
            following: group.entityEpisodes,
        });
        if (outcome.outcome === null) {
            dropped.censored += 1;

            return;
        }
        const monthKey = betaMonthKeyOf(first.call.at);
        const offset = params.offsetLogitByMonth?.[monthKey];
        const lead = weekly
            .get(first.call.managerId)
            ?.get(weekIndexOf(first.ms) + leadWeeks);
        const stratum: AiBetaLeadKind = leadKindOf(
            first.call,
            group.episode,
            group.entityEpisodes[0] ?? group.episode,
        );
        seeds.push({
            callId: first.call.callId,
            managerId: first.call.managerId,
            entityId: group.episode.entityId,
            episodeKey: group.episode.key,
            at: first.call.at,
            monthKey,
            stratum,
            score: form.score,
            scoreSource: form.source,
            callsInEpisode: group.calls.length - 1,
            offset:
                typeof offset === 'number' && Number.isFinite(offset)
                    ? offset
                    : 0,
            outcome: outcome.outcome,
            daysToOutcome: outcome.daysToOutcome,
            sBarLead: lead ?? null,
        });
    });

    return assembleBetaSample(seeds, { dropped, windowDays, formSections });
}
