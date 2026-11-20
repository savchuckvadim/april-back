/**
 * Витрина «Движение сделок» отчёта KPI (постановка
 * ai/tasks/ai-polyansky-method/2026-11-10-deal-movement.md, §7): маршруты,
 * пределы запроса, полосы оценки звонка, пороги «мало звонков» и тексты
 * для человека. Данные — только ночные снимки (ais) и разборы звонков из
 * БД: живых запросов в Битрикс витрина не делает.
 */
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_LEADER_ROLES,
} from '../constants/ai-analytics.const';

/** Обзор: статусы, динамика, матрица и честность оценок. */
export const DEAL_MOVEMENT_OVERVIEW_ROUTE = 'deal-movement/overview' as const;

/** Проблемные сделки последней ночи — постранично. */
export const DEAL_MOVEMENT_DEALS_ROUTE = 'deal-movement/deals' as const;

/** Период не длиннее стольких дней (обе даты включительно). */
export const DEAL_MOVEMENT_MAX_DAYS = 92;

/**
 * Сколько дней после конца периода читаются ночные снимки ради проверки
 * продвижения: звонок конца периода проверяется через N дней (12 по
 * умолчанию) плюс запас ночей. Дальше «сегодня» не читается.
 */
export const DEAL_MOVEMENT_CHECK_TAIL_DAYS = 31;

/** Размер страницы списка сделок по умолчанию и потолок. */
export const DEAL_MOVEMENT_PAGE_LIMITS = {
    defaultPageSize: 25,
    maxPageSize: 100,
} as const;

/** Сколько живёт выборка периода и список сделок в кэше, секунд. */
export const DEAL_MOVEMENT_TTL_SECONDS = 300;

/** Версия формы выборки в кэше: меняется вместе с формой. */
const DEAL_MOVEMENT_CACHE_VERSION = 'v1';

/** Ключ выборки периода обзора. */
export const buildDealMovementPeriodKey = (
    domain: string,
    from: string,
    to: string,
): string =>
    `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:deal-movement:${DEAL_MOVEMENT_CACHE_VERSION}:${from}_${to}`;

/** Ключ списка проблемных сделок последней ночи. */
export const buildDealMovementDealsKey = (domain: string): string =>
    `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:deal-movement-deals:${DEAL_MOVEMENT_CACHE_VERSION}`;

/**
 * Полосы оценки звонка по шкале витрины 1–10: низкая — до 5, средняя —
 * от 5 до 8, высокая — от 8 (оценка с одной цифрой после запятой: 4,9 —
 * низкая, 7,9 — средняя).
 */
export const DEAL_MOVEMENT_SCORE_BANDS = ['low', 'mid', 'high'] as const;
export type DealMovementScoreBand = (typeof DEAL_MOVEMENT_SCORE_BANDS)[number];

export const DEAL_MOVEMENT_SCORE_BAND_RULES: Readonly<
    Record<
        DealMovementScoreBand,
        { readonly title: string; readonly min: number; readonly max: number }
    >
> = {
    low: { title: 'Низкая оценка (1–4)', min: 1, max: 4.9 },
    mid: { title: 'Средняя оценка (5–7)', min: 5, max: 7.9 },
    high: { title: 'Высокая оценка (8–10)', min: 8, max: 10 },
};

/** Оценка 1–10 → полоса. */
export const scoreBandOf = (score10: number): DealMovementScoreBand =>
    score10 < DEAL_MOVEMENT_SCORE_BAND_RULES.mid.min
        ? 'low'
        : score10 < DEAL_MOVEMENT_SCORE_BAND_RULES.high.min
          ? 'mid'
          : 'high';

/** Уровни продвижения сделки по звонку (шкала методики). */
export const DEAL_MOVEMENT_PROGRESS_LEVELS = [1, 2, 3, 4, 5] as const;

/**
 * Пометка клетки «низкое качество × высокое продвижение» (продвижение
 * 4–5 при низкой оценке звонка).
 */
export const DEAL_MOVEMENT_CELL_FLAGS = ['buy_anyway'] as const;
export type DealMovementCellFlag = (typeof DEAL_MOVEMENT_CELL_FLAGS)[number];

/** Меньше стольких звонков — пометка «мало звонков» (число всё равно есть). */
export const DEAL_MOVEMENT_FEW_CALLS = {
    matrix: 8,
    honesty: 10,
} as const;

/** Кому открыт раздел: руководители по структуре (и суперпользователь). */
export const DEAL_MOVEMENT_ROLES = AI_ANALYTICS_LEADER_ROLES;

/** Тексты для человека: без кодов и названий сервисов. */
export const DEAL_MOVEMENT_TEXTS = {
    leadersOnly: 'Раздел доступен руководителям',
    period: `Период — не длиннее ${DEAL_MOVEMENT_MAX_DAYS} дней, начало не позже конца`,
    fewCalls: 'мало звонков',
    buyAnyway: 'клиент купил бы и без менеджера',
    noSnapshots:
        'Ночного счёта движения сделок за период нет: движение сделок не ' +
        'включено на портале или ещё не считалось',
    oldSnapshots:
        'Часть ночей посчитана до 20.11.2026: по ним нет сумм и разреза по ' +
        'менеджерам',
    noDeals:
        'Списка проблемных сделок ещё нет: он появится после ближайшего ' +
        'ночного счёта',
} as const;
