/**
 * Эпизоды сделки — вторая единица анализа (план `ai-sales-analytics`, §4.1
 * «Три единицы анализа»).
 *
 * Эпизод — отрезок жизни сделки основной воронки между двумя переходами
 * стадий. Он заканчивается **продвижением** (стадия с бо́льшим `order`),
 * **отказом** (коды отказа лестницы `sales_fail | sales_double |
 * sales_not_ca`, а также откат на стадию ниже) или **цензурой** (сделка ещё
 * открыта на момент расчёта). Эпизод убирает двойной счёт «три звонка →
 * одна продажа»: числитель считается по эпизодам, а не по звонкам (сцепка —
 * `episode-link.ts`).
 *
 * Чистый слой: формы данных Битрикс сюда не проникают — на вход приходит уже
 * нормализованный переход `StageTransition` (маппинг `crm.stagehistory` →
 * `StageTransition` делает шаг приложения). Время — только параметром `now`,
 * `new Date()` и `Date.now()` внутри запрещены.
 */
import {
    AI_EPISODE_FAIL_STAGE_CODES,
    AI_EPISODE_SUCCESS_STAGE_CODE,
    type AiEpisodeEnd,
    type AiEpisodeEndReason,
    type BuildEpisodesOptions,
    type DealEpisode,
    EPISODE_KEY_SEPARATOR,
    type EpisodesByEntity,
    MS_PER_DAY,
    type StageTransition,
} from './episode.types';

export * from './episode.types';

/** Точность длительностей в днях: защита от шума float (6 знаков). */
const DAYS_PRECISION = 1e6;

interface EpisodeContext {
    readonly failCodes: ReadonlySet<string>;
    readonly successCode: string;
    readonly now: string;
}

interface OrderedTransition {
    readonly transition: StageTransition;
    readonly at: number;
    readonly index: number;
}

const roundDays = (days: number): number =>
    Math.round(days * DAYS_PRECISION) / DAYS_PRECISION;

/** ISO 8601 → миллисекунды; null для неразбираемой строки. */
export function parseInstant(iso: string): number | null {
    const ms = Date.parse(iso);

    return Number.isFinite(ms) ? ms : null;
}

/** Разница в днях между двумя ISO-моментами; null — момент не разобран. */
export function daysBetween(fromIso: string, toIso: string): number | null {
    const from = parseInstant(fromIso);
    const to = parseInstant(toIso);
    if (from === null || to === null) {
        return null;
    }

    return roundDays((to - from) / MS_PER_DAY);
}

/** Ключ эпизода `entityId#index`. */
export function episodeKeyOf(entityId: string, index: number): string {
    return `${entityId}${EPISODE_KEY_SEPARATOR}${index}`;
}

/** Убирает подряд идущие записи одной и той же стадии (повтор истории). */
function dedupeConsecutive(
    items: readonly StageTransition[],
): StageTransition[] {
    return items.filter(
        (item, index) =>
            index === 0 || items[index - 1].stageCode !== item.stageCode,
    );
}

/**
 * Переходы по сущностям, отсортированные по времени. Переходы с неразбираемым
 * `at` отбрасываются: без времени эпизод не построить.
 */
function groupTransitions(
    transitions: readonly StageTransition[],
): Map<string, StageTransition[]> {
    const ordered = new Map<string, OrderedTransition[]>();
    transitions.forEach((transition, index) => {
        const at = parseInstant(transition.at);
        if (at === null) {
            return;
        }
        const list = ordered.get(transition.entityId) ?? [];
        list.push({ transition, at, index });
        ordered.set(transition.entityId, list);
    });
    const result = new Map<string, StageTransition[]>();
    ordered.forEach((list, entityId) => {
        const sorted = [...list].sort(
            (a, b) => a.at - b.at || a.index - b.index,
        );
        result.set(
            entityId,
            dedupeConsecutive(sorted.map(item => item.transition)),
        );
    });

    return result;
}

/** Терминальная стадия: отказ, продажа или любая неоткрытая семантика. */
function isTerminal(
    transition: StageTransition,
    context: EpisodeContext,
): boolean {
    return (
        context.failCodes.has(transition.stageCode) ||
        transition.stageCode === context.successCode ||
        transition.semantic !== 'P'
    );
}

/**
 * Классификация конца. Порядок проверок значим: коды отказа стоят в лестнице
 * ВЫШЕ продажи (12–14 против 11), поэтому сравнение `order` без проверки
 * кодов назвало бы отказ продвижением.
 */
function endOf(
    from: StageTransition,
    to: StageTransition,
    context: EpisodeContext,
): { end: AiEpisodeEnd; reason: AiEpisodeEndReason } {
    if (context.failCodes.has(to.stageCode) || to.semantic === 'F') {
        return { end: 'fail', reason: 'fail-stage' };
    }
    if (to.order > from.order) {
        return { end: 'advance', reason: 'advance' };
    }

    return { end: 'fail', reason: 'rollback' };
}

function closedEpisode(
    from: StageTransition,
    to: StageTransition,
    index: number,
    context: EpisodeContext,
): DealEpisode {
    const { end, reason } = endOf(from, to, context);
    const duration = daysBetween(from.at, to.at);

    return {
        entityId: from.entityId,
        index,
        key: episodeKeyOf(from.entityId, index),
        stageCode: from.stageCode,
        order: from.order,
        startedAt: from.at,
        endedAt: to.at,
        toStageCode: to.stageCode,
        toOrder: to.order,
        end,
        endReason: reason,
        durationDays: duration === null ? null : Math.max(0, duration),
        ageDays: Math.max(0, duration ?? 0),
        success: to.stageCode === context.successCode || to.semantic === 'S',
    };
}

function censoredEpisode(
    from: StageTransition,
    index: number,
    context: EpisodeContext,
): DealEpisode {
    return {
        entityId: from.entityId,
        index,
        key: episodeKeyOf(from.entityId, index),
        stageCode: from.stageCode,
        order: from.order,
        startedAt: from.at,
        endedAt: null,
        toStageCode: null,
        toOrder: null,
        end: 'censored',
        endReason: 'open',
        durationDays: null,
        ageDays: Math.max(0, daysBetween(from.at, context.now) ?? 0),
        success: false,
    };
}

function entityEpisodes(
    items: readonly StageTransition[],
    context: EpisodeContext,
): DealEpisode[] {
    const episodes: DealEpisode[] = [];
    items.forEach((from, position) => {
        const to = items[position + 1];
        if (to) {
            episodes.push(closedEpisode(from, to, episodes.length, context));

            return;
        }
        if (!isTerminal(from, context)) {
            episodes.push(censoredEpisode(from, episodes.length, context));
        }
    });

    return episodes;
}

/**
 * Эпизоды по нормализованным переходам стадий (план §4.1). Открытая сделка
 * даёт последний эпизод с концом `censored` и пустой длительностью — его
 * знаменатель есть, а исхода ещё нет.
 */
export function buildEpisodes(
    transitions: readonly StageTransition[],
    options: BuildEpisodesOptions,
): DealEpisode[] {
    const context: EpisodeContext = {
        failCodes: new Set<string>(
            options.failStageCodes ?? AI_EPISODE_FAIL_STAGE_CODES,
        ),
        successCode: options.successStageCode ?? AI_EPISODE_SUCCESS_STAGE_CODE,
        now: options.now,
    };
    const byEntity = groupTransitions(transitions);
    const entityIds = [...byEntity.keys()].sort((a, b) => a.localeCompare(b));

    return entityIds.flatMap(entityId =>
        entityEpisodes(byEntity.get(entityId) ?? [], context),
    );
}

/** Группировка эпизодов по сущности — вход `linkCallsToEpisodes`. */
export function groupEpisodesByEntity(
    episodes: readonly DealEpisode[],
): EpisodesByEntity {
    const result: Record<string, DealEpisode[]> = {};
    episodes.forEach(episode => {
        const list = result[episode.entityId] ?? [];
        list.push(episode);
        result[episode.entityId] = list;
    });
    Object.values(result).forEach(list =>
        list.sort((a, b) => a.index - b.index),
    );

    return result;
}

/**
 * Эпизод, накрывающий момент `iso`: `startedAt ≤ iso < endedAt`
 * (у цензурированного правая граница открыта). null — момент вне жизни сделки.
 */
export function episodeAt(
    episodes: readonly DealEpisode[],
    iso: string,
): DealEpisode | null {
    const at = parseInstant(iso);
    if (at === null) {
        return null;
    }

    return (
        episodes.find(episode => {
            const started = parseInstant(episode.startedAt);
            if (started === null || at < started) {
                return false;
            }
            const ended =
                episode.endedAt === null ? null : parseInstant(episode.endedAt);

            return ended === null || at < ended;
        }) ?? null
    );
}
