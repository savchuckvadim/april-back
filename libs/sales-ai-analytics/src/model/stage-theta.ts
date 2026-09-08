/**
 * Стадийные θ, факты сроков и лаги продаж по эпизодам сделок
 * (план `ai-sales-analytics`, §4.1 «Три единицы анализа», §4.2 усадка,
 * §4.8 лаг «презентация → оплата»).
 *
 * Три разные величины по одному и тому же входу — эпизодам:
 * 1. `stageTheta` — вероятность продажи из стадии: Beta-биномиал с усадкой
 *    к норме слоя `E[θ] = (s + κ·μ)/(n + κ)`, `w = n/(n + κ)`. Знаменатель —
 *    сделки, дожившие до исхода; открытые (цензура) в знаменатель не входят,
 *    иначе стадия внизу лестницы выглядела бы хуже, чем она есть.
 * 2. `stageSlaFacts` — факты сроков по стадиям (p25/p50/p90 длительности
 *    закрытых эпизодов). Это **факт**, а не норматив: договорённости об SLA
 *    руководитель сверяет с ним (санити-панель §4.11).
 * 3. `saleLags` — лаги продаж под оценку `F(d)` (`lag-cdf.ts`).
 *
 * Чистый слой: на вход приходят уже построенные эпизоды, форм данных Битрикс
 * здесь нет; время берётся только из полей эпизода, `new Date()` запрещён.
 */
import {
    AI_EPISODE_SUCCESS_STAGE_CODE,
    type DealEpisode,
    daysBetween,
} from './episode';
import { quantileOf } from './quantile.util';
import { type ShrinkPrior, shrinkRate } from './shrink';
import {
    type AiDealOutcome,
    type SaleLagFact,
    type SaleLagsOptions,
    STAGE_SLA_QUANTILES,
    STAGE_THETA_DEFAULTS,
    type StagePriorSource,
    type StageSlaFact,
    type StageTheta,
    type StageThetaOptions,
} from './stage-theta.types';

export * from './stage-theta.types';

/** Точность дней и долей: 6 знаков — защита от шума float. */
const PRECISION = 1e6;

const round = (value: number): number =>
    Math.round(value * PRECISION) / PRECISION;

const isPrior = (source: StagePriorSource): source is ShrinkPrior =>
    typeof (source as ShrinkPrior).mu === 'number' &&
    typeof (source as ShrinkPrior).kappa === 'number';

/** Норма для стадии: общая, своя или дефолт реестра. */
function priorOf(
    source: StagePriorSource | undefined,
    stageCode: string,
): ShrinkPrior {
    const fallback: ShrinkPrior = {
        mu: STAGE_THETA_DEFAULTS.mu,
        kappa: STAGE_THETA_DEFAULTS.kappa,
    };
    if (source === undefined) {
        return fallback;
    }

    return isPrior(source) ? source : (source[stageCode] ?? fallback);
}

/** Эпизоды сделки по сущностям, в порядке `index`. */
function byEntity(
    episodes: readonly DealEpisode[],
): Map<string, DealEpisode[]> {
    const result = new Map<string, DealEpisode[]>();
    episodes.forEach(episode => {
        const list = result.get(episode.entityId) ?? [];
        list.push(episode);
        result.set(episode.entityId, list);
    });
    result.forEach(list => list.sort((a, b) => a.index - b.index));

    return result;
}

/**
 * Исход сделки целиком: продажа важнее цензуры (сделка могла быть продана и
 * открыта заново), цензура важнее отказа — исход ещё не определён.
 */
function outcomeOf(
    list: readonly DealEpisode[],
    successStageCode: string,
): AiDealOutcome {
    if (
        list.some(
            episode =>
                episode.success || episode.toStageCode === successStageCode,
        )
    ) {
        return 'sale';
    }

    return list.some(episode => episode.end === 'censored') ? 'open' : 'lost';
}

interface StageCounters {
    order: number;
    n: number;
    s: number;
    censored: number;
}

/** Первое посещение стадии сделкой: повторные заходы не удваивают счёт. */
function countStages(
    entities: Map<string, DealEpisode[]>,
    successStageCode: string,
): Map<string, StageCounters> {
    const counters = new Map<string, StageCounters>();
    entities.forEach(list => {
        const outcome = outcomeOf(list, successStageCode);
        const visited = new Set<string>();
        list.forEach(episode => {
            if (visited.has(episode.stageCode)) {
                return;
            }
            visited.add(episode.stageCode);
            const current = counters.get(episode.stageCode) ?? {
                order: episode.order,
                n: 0,
                s: 0,
                censored: 0,
            };
            current.n += outcome === 'open' ? 0 : 1;
            current.s += outcome === 'sale' ? 1 : 0;
            current.censored += outcome === 'open' ? 1 : 0;
            counters.set(episode.stageCode, current);
        });
    });

    return counters;
}

/**
 * Вероятность продажи из стадии (план §4.1, §4.2). Знаменатель — сделки,
 * побывавшие на стадии и дожившие до исхода; числитель — дошедшие до продажи.
 * Результат отсортирован по порядку стадии в лестнице.
 */
export function stageTheta(
    episodes: readonly DealEpisode[],
    options: StageThetaOptions = {},
): StageTheta[] {
    const successStageCode =
        options.successStageCode ?? AI_EPISODE_SUCCESS_STAGE_CODE;
    const counters = countStages(byEntity(episodes), successStageCode);

    return [...counters.entries()]
        .map(([stageCode, counts]) => ({
            stageCode,
            order: counts.order,
            s: counts.s,
            censored: counts.censored,
            ...shrinkRate({
                successes: counts.s,
                exposure: counts.n,
                prior: priorOf(options.prior, stageCode),
                intervalKind: 'wilson',
                z: options.z,
            }),
        }))
        .sort(
            (a, b) =>
                a.order - b.order || a.stageCode.localeCompare(b.stageCode),
        );
}

/**
 * Квантиль (тип 7) фактов сроков, округлённый до 1e-6: длительности
 * эпизодов считаются в днях из разности меток времени, и без округления
 * шум float вылезал бы в SLA-факты. Сама формула — общая
 * (`quantile.util.ts`), здесь только округление.
 */
export function stageQuantileOf(values: readonly number[], q: number): number {
    return round(quantileOf(values, q));
}

/**
 * Факты сроков по стадиям (план §4.11): p25/p50/p90 длительности **закрытых**
 * эпизодов. Открытые эпизоды длительности не имеют и в факты не входят.
 */
export function stageSlaFacts(
    episodes: readonly DealEpisode[],
): Record<string, StageSlaFact> {
    const durations = new Map<string, number[]>();
    episodes.forEach(episode => {
        if (episode.durationDays === null) {
            return;
        }
        const list = durations.get(episode.stageCode) ?? [];
        list.push(episode.durationDays);
        durations.set(episode.stageCode, list);
    });
    const result: Record<string, StageSlaFact> = {};
    durations.forEach((list, stageCode) => {
        result[stageCode] = {
            p25: stageQuantileOf(list, STAGE_SLA_QUANTILES.p25),
            p50: stageQuantileOf(list, STAGE_SLA_QUANTILES.p50),
            p90: stageQuantileOf(list, STAGE_SLA_QUANTILES.p90),
            n: list.length,
        };
    });

    return result;
}

/** Точка отсчёта лага: первый заход на стадию либо первый эпизод сделки. */
function lagOrigin(
    list: readonly DealEpisode[],
    fromStageCode?: string,
): DealEpisode | undefined {
    return fromStageCode === undefined
        ? list[0]
        : list.find(episode => episode.stageCode === fromStageCode);
}

function openLag(
    origin: DealEpisode,
    list: readonly DealEpisode[],
): number | null {
    const open = list.find(episode => episode.end === 'censored');
    if (open === undefined) {
        return null;
    }
    const offset = daysBetween(origin.startedAt, open.startedAt);

    return offset === null ? null : Math.max(0, offset + open.ageDays);
}

/**
 * Лаги продаж под оценку `F(d)` (план §4.8). Окно атрибуции здесь не
 * применяется — его накладывает `selectSaleLags` в `lag-cdf.ts`.
 */
export function saleLags(
    episodes: readonly DealEpisode[],
    options: SaleLagsOptions = {},
): SaleLagFact[] {
    const facts: SaleLagFact[] = [];
    byEntity(episodes).forEach((list, entityId) => {
        const origin = lagOrigin(list, options.fromStageCode);
        if (origin === undefined) {
            return;
        }
        const sale = list.find(episode => episode.success);
        const days =
            sale?.endedAt != null
                ? daysBetween(origin.startedAt, sale.endedAt)
                : options.includeOpen === true
                  ? openLag(origin, list)
                  : null;
        if (days === null) {
            return;
        }
        const lagDays = round(Math.max(0, days));
        facts.push({
            entityId,
            episodeKey: (sale ?? origin).key,
            lagDays,
            days: lagDays,
            censored: sale === undefined,
        });
    });

    return facts.sort((a, b) => a.entityId.localeCompare(b.entityId));
}
