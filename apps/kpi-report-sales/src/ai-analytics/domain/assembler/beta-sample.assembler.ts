/**
 * Сборка выборки «звонок-триггер → ближний исход» для оценки β (план
 * `ai-sales-analytics` §4.4; Фаза 4, П15): lite-строки звонков за окно
 * модели + сущности CRM из `ais` + эпизоды шага истории стадий → сцепка
 * (`linkCallsToEpisodes`) → выборка библиотеки (`buildBetaSample`).
 *
 * Ассемблер ничего не считает сам: триггер, `S^form`, ближний исход,
 * лид плацебо `S̄_{m,w+k}` и центрирование Мундлака — в библиотеке. Здесь
 * только проекция строк, параметры реестра портала и порядок вызовов.
 *
 * ⚠ Момент звонка подаётся в TZ ПОРТАЛА ('YYYY-MM-DDTHH:mm:ss.sss+03:00'):
 * ключ месяца оффсета библиотека берёт из первых семи символов строки,
 * и звонок 31-го в 23:30 по Москве не должен уехать в следующий месяц.
 *
 * Чистая функция: без DI, Битрикса и `new Date()`.
 */
import {
    AI_LEAD_STRATA_DIMENSIONS,
    BETA_SAMPLE_DEFAULTS,
    buildBetaSample,
    csvItems,
    groupEpisodesByEntity,
    linkCallsToEpisodes,
    resolveNumberParam,
    resolveParam,
    type AiBetaLeadKind,
    type AiLeadStrataDimension,
    type BetaLeadKindResolver,
    type BetaSample,
    type BetaSampleCall,
    type BetaSampleParams,
    type CallForLink,
    type CallLink,
    type DealEpisode,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { CallEntityRef } from '../loaders/call-entity.loader';

/** Звонок в объёме выборки: lite-строка call-lib с известным временем. */
export interface BetaSampleSourceRow {
    readonly transcriptionId: string;
    readonly managerId: string | null;
    readonly callStartedAt: Date;
    readonly callType: string | null;
    readonly score: number | null;
    readonly sections: readonly {
        readonly section: string;
        readonly relevance: number;
        readonly score: number | null;
    }[];
}

export interface BetaSampleAssemblyInput {
    /** Звонки окна (уже отфильтрованы по ростеру). */
    readonly rows: readonly BetaSampleSourceRow[];
    /** Сущности CRM звонков из `ais` по транскрипции. */
    readonly refs: ReadonlyMap<string, CallEntityRef>;
    /** Эпизоды сделок из шины шага истории стадий. */
    readonly episodes: readonly DealEpisode[];
    /** IANA-пояс портала. */
    readonly timeZone: string;
    /** Момент расчёта, ISO 8601 (цензура ближнего исхода). */
    readonly now: string;
    /** Слои реестра портала. */
    readonly registry: ParamContext;
    /** Месяцы окна 'YYYY-MM' — ключи оффсета. */
    readonly monthKeys: readonly string[];
    /** Логит нормы «презентация → КП» модели портала; null — оффсета нет. */
    readonly offsetLogit: number | null;
}

export interface BetaSampleAssembly {
    readonly sample: BetaSample;
    /** Сцепка всех звонков окна (в том числе несцепленных). */
    readonly links: readonly CallLink[];
    readonly calls: readonly BetaSampleCall[];
}

const MS_PER_MINUTE = 60_000;

/** Смещение пояса относительно UTC в минутах на момент `date`. */
function offsetMinutes(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find(part => part.type === type)?.value ?? '0');
    const asUtc = Date.UTC(
        read('year'),
        read('month') - 1,
        read('day'),
        read('hour'),
        read('minute'),
        read('second'),
    );
    const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;

    return Math.round((asUtc - wholeSeconds) / MS_PER_MINUTE);
}

const pad = (value: number, width = 2): string =>
    String(Math.abs(value)).padStart(width, '0');

/**
 * Момент в поясе портала ISO 8601 со смещением: '2026-08-31T23:30:00.000+03:00'.
 * Тот же инстант, что и `toISOString()`, но календарная часть — портала.
 */
export function portalIsoOf(date: Date, timeZone: string): string {
    const offset = offsetMinutes(date, timeZone);
    const local = new Date(date.getTime() + offset * MS_PER_MINUTE);
    const sign = offset < 0 ? '-' : '+';
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;

    return `${local.toISOString().slice(0, 23)}${sign}${pad(hours)}:${pad(minutes)}`;
}

/** Строки звонков → звонки выборки: время в поясе портала, сущность из `ais`. */
export function betaCallsOf(
    rows: readonly BetaSampleSourceRow[],
    refs: ReadonlyMap<string, CallEntityRef>,
    timeZone: string,
): BetaSampleCall[] {
    return rows.flatMap((row): BetaSampleCall[] => {
        if (row.managerId === null || !row.transcriptionId) return [];
        const entityType = refs.get(row.transcriptionId)?.entityType;

        return [
            {
                callId: row.transcriptionId,
                managerId: row.managerId,
                at: portalIsoOf(row.callStartedAt, timeZone),
                callType: row.callType,
                score: row.score,
                sections: row.sections.map(section => ({
                    section: section.section,
                    relevance: section.relevance,
                    score: section.score,
                })),
                ...(entityType === undefined ? {} : { entityType }),
            },
        ];
    });
}

/** Измерения страт из csv `lead_kind_strata`; неизвестные коды отброшены. */
export function strataDimensionsOf(
    registry: ParamContext,
): AiLeadStrataDimension[] {
    const value = resolveParam('lead_kind_strata', registry).value;
    const items = typeof value === 'string' ? csvItems(value) : [];

    return AI_LEAD_STRATA_DIMENSIONS.filter(dimension =>
        items.includes(dimension),
    );
}

/**
 * Правило страты по измерениям портала: «вид работы с лидом» даёт `lead`
 * для звонка по лиду, «стадия основной сделки» — `cold` для сделки,
 * пришедшей с холодной стадии; иначе `request`. Тип перспективы и размер
 * компании в `ais` не лежат — эти измерения выборка пока не различает.
 * Оба измерения по умолчанию = `defaultLeadKindOf` библиотеки.
 */
export function leadKindResolverOf(
    dimensions: readonly AiLeadStrataDimension[],
): BetaLeadKindResolver {
    const byLead = dimensions.includes('lead_work_kind');
    const byStage = dimensions.includes('sales_base_stage');

    return (call, _episode, firstEpisode): AiBetaLeadKind => {
        if (byLead && call.entityType === 'lead') return 'lead';
        if (
            byStage &&
            firstEpisode.stageCode === PBX_DEAL_SALES_BASE_STAGE_CODE.cold
        ) {
            return 'cold';
        }

        return 'request';
    };
}

/** Состав «формы» из csv `quality_form_sections` портала. */
export function formSectionsOf(registry: ParamContext): readonly string[] {
    const value = resolveParam('quality_form_sections', registry).value;
    const items = typeof value === 'string' ? csvItems(value) : [];

    return items.length > 0 ? items : BETA_SAMPLE_DEFAULTS.formSections;
}

/** Параметры сборки выборки из реестра портала. */
export function betaSampleParamsOf(
    input: Pick<
        BetaSampleAssemblyInput,
        'registry' | 'now' | 'monthKeys' | 'offsetLogit'
    >,
): BetaSampleParams {
    const windowDays = resolveNumberParam(
        'lag_window_near_days',
        input.registry,
    );
    const leadWeeks = resolveNumberParam(
        'beta_placebo_lead_weeks',
        input.registry,
    );
    const offset = input.offsetLogit;
    const offsetLogitByMonth =
        offset !== null && Number.isFinite(offset)
            ? Object.fromEntries(input.monthKeys.map(key => [key, offset]))
            : undefined;

    return {
        now: input.now,
        formSections: formSectionsOf(input.registry),
        leadKindOf: leadKindResolverOf(strataDimensionsOf(input.registry)),
        ...(windowDays === undefined ? {} : { windowDays }),
        ...(leadWeeks === undefined ? {} : { leadWeeks }),
        ...(offsetLogitByMonth === undefined ? {} : { offsetLogitByMonth }),
    };
}

/**
 * Звонки для сцепки. Звонок без записи разбора остаётся с пустой сущностью
 * и уходит в выборку как несцепленный (`no-link`) — то же правило, что у
 * шага истории стадий (`toCallsForLink`).
 */
function callsForLinkOf(
    calls: readonly BetaSampleCall[],
    refs: ReadonlyMap<string, CallEntityRef>,
): CallForLink[] {
    return calls.map((call): CallForLink => {
        const ref = refs.get(call.callId);

        return {
            callId: call.callId,
            at: call.at,
            entityType: ref?.entityType ?? 'deal',
            entityId: ref?.entityId ?? '',
        };
    });
}

/**
 * Выборка β портала: звонки окна → сцепка с эпизодами (подсказок сцепки
 * пока нет, как у шага истории стадий) → `buildBetaSample`.
 */
export function assemblePortalBetaSample(
    input: BetaSampleAssemblyInput,
): BetaSampleAssembly {
    const calls = betaCallsOf(input.rows, input.refs, input.timeZone);
    const episodesByEntity = groupEpisodesByEntity(input.episodes);
    const links = linkCallsToEpisodes(
        callsForLinkOf(calls, input.refs),
        episodesByEntity,
        {},
    );
    const sample = buildBetaSample({
        calls,
        links,
        episodesByEntity,
        params: betaSampleParamsOf(input),
    });

    return { sample, links, calls };
}
