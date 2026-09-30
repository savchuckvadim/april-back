/**
 * Ближний исход эпизода для звонка-триггера (план `ai-sales-analytics`,
 * §4.4 «оцениваемая величина»): «презентация → КП/счёт в окне
 * `W_near = lag_window_near_days`». Конкурирующие риски — продвижение к
 * стадии КП и выше против отказа/отката; открытые эпизоды, у которых окно
 * ещё не истекло к моменту расчёта, цензурируются.
 *
 * Стадия «КП/счёт» — `sales_offer_create` лестницы `sales_base`
 * (`PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate`); её порядок берётся из
 * `as const` portal-lib, литералов стадий в модели нет
 * (ai/rules/pbx-typing.md). Если эпизод звонка закончился продвижением
 * ниже КП (презентация → доработка), исход ищется дальше по цепочке
 * следующих эпизодов той же сделки в пределах окна: так «презентация →
 * доработка → КП за 10 дней» остаётся исходом 1, а «→ доработка → отказ»
 * — исходом 0.
 *
 * Чистая математика: время только параметрами (`callAt`, `now`).
 */
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    getSalesBaseStageOrder,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { registryDefault } from '../params/registry.access';
import {
    type DealEpisode,
    MS_PER_DAY,
    daysBetween,
    parseInstant,
} from './episode';

/** Почему исход такой: продвижение, отказ, окно истекло, цензура. */
export const AI_NEAR_OUTCOME_REASONS = [
    'advance',
    'fail',
    'window-elapsed',
    'censored',
] as const;

export type AiNearOutcomeReason = (typeof AI_NEAR_OUTCOME_REASONS)[number];

/** Исход: 1 — КП/счёт в окне, 0 — нет, null — окно ещё открыто. */
export type NearOutcomeValue = 0 | 1 | null;

/** Ближний исход эпизода относительно звонка-триггера. */
export interface NearOutcome {
    readonly outcome: NearOutcomeValue;
    readonly reason: AiNearOutcomeReason;
    /** Дней от звонка до события (продвижения/отказа); null — события нет. */
    readonly daysToOutcome: number | null;
}

/** Стадия «КП/счёт» — цель ближнего исхода (лестница `sales_base`). */
export const NEAR_OUTCOME_TARGET_STAGE_CODE =
    PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate;

/** Порядок целевой стадии в лестнице — из `as const` portal-lib. */
export const NEAR_OUTCOME_TARGET_ORDER = getSalesBaseStageOrder(
    NEAR_OUTCOME_TARGET_STAGE_CODE,
);

/** Дефолты ближнего исхода: окно — из реестра, цель — из лестницы. */
export const NEAR_OUTCOME_DEFAULTS = {
    /** `lag_window_near_days` — окно `W_near` в календарных днях. */
    windowDays: registryDefault('lag_window_near_days'),
    /** Порядок стадии «КП/счёт» (`sales_offer_create`). */
    targetOrder: NEAR_OUTCOME_TARGET_ORDER,
} as const;

export interface NearOutcomeOptions {
    /** Момент расчёта, ISO 8601 — только параметром. */
    readonly now: string;
    /** Окно `W_near`; по умолчанию `lag_window_near_days`. */
    readonly windowDays?: number;
    /** Порядок целевой стадии; по умолчанию порядок `sales_offer_create`. */
    readonly targetOrder?: number;
    /**
     * Следующие эпизоды той же сделки (по ним ищется исход, если эпизод
     * звонка продвинулся ниже КП). Чужие сделки и более ранние эпизоды
     * отбрасываются.
     */
    readonly following?: readonly DealEpisode[];
}

const CENSORED: NearOutcome = {
    outcome: null,
    reason: 'censored',
    daysToOutcome: null,
};

const positiveOr = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : fallback;

/** Эпизод звонка и его продолжения той же сделки в порядке index. */
function chainOf(
    episode: DealEpisode,
    following: readonly DealEpisode[] | undefined,
): DealEpisode[] {
    const next = (following ?? [])
        .filter(
            item =>
                item.entityId === episode.entityId &&
                item.index > episode.index,
        )
        .sort((a, b) => a.index - b.index);

    return [episode, ...next];
}

function eventOutcome(
    outcome: 0 | 1,
    reason: AiNearOutcomeReason,
    callAt: string,
    endedAt: string,
): NearOutcome {
    return {
        outcome,
        reason,
        daysToOutcome: Math.max(0, daysBetween(callAt, endedAt) ?? 0),
    };
}

/**
 * Ближний исход эпизода для звонка в момент `callAt` (план §4.4).
 *
 * Правила: продвижение к стадии с порядком ≥ порядка КП не позже
 * `callAt + windowDays` → 1 (`advance`); отказ или откат в окне → 0
 * (`fail`); окно истекло к `now` без исхода → 0 (`window-elapsed`);
 * иначе — цензура (`null`, `censored`). Неразбираемое время — цензура:
 * без момента звонка окно не построить.
 */
export function nearOutcomeOf(
    episode: DealEpisode,
    callAt: string,
    options: NearOutcomeOptions,
): NearOutcome {
    const at = parseInstant(callAt);
    const now = parseInstant(options.now);
    if (at === null || now === null) {
        return CENSORED;
    }
    const windowDays = positiveOr(
        options.windowDays,
        NEAR_OUTCOME_DEFAULTS.windowDays,
    );
    const targetOrder = positiveOr(
        options.targetOrder,
        NEAR_OUTCOME_DEFAULTS.targetOrder,
    );
    const windowEnd = at + windowDays * MS_PER_DAY;
    for (const step of chainOf(episode, options.following)) {
        if (step.endedAt === null) {
            break;
        }
        const ended = parseInstant(step.endedAt);
        if (ended === null || ended > windowEnd) {
            break;
        }
        if (step.end === 'fail') {
            return eventOutcome(0, 'fail', callAt, step.endedAt);
        }
        if (
            step.end === 'advance' &&
            step.toOrder !== null &&
            step.toOrder >= targetOrder
        ) {
            return eventOutcome(1, 'advance', callAt, step.endedAt);
        }
    }
    if (now >= windowEnd) {
        return { outcome: 0, reason: 'window-elapsed', daysToOutcome: null };
    }

    return CENSORED;
}
