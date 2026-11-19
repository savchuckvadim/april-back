/**
 * Раздел «Разборы звонков» отчёта KPI (техрешение
 * ai/tasks/2026-11-19-call-reviews-design.md, этап 1): маршрут, пределы
 * запроса, справочники фильтров и тексты для человека.
 */
import { AI_ANALYTICS_LEADER_ROLES } from '../constants/ai-analytics.const';

/** Список разборов за период — под сессией портала. */
export const CALLS_LIST_ROUTE = 'calls/list' as const;

/** Период не длиннее стольких дней (обе даты включительно). */
export const CALLS_LIST_MAX_DAYS = 92;

/** Размер страницы по умолчанию и потолок. */
export const CALLS_LIST_PAGE_LIMITS = {
    defaultPageSize: 25,
    maxPageSize: 100,
} as const;

/** Сколько менеджеров и типов звонка можно выбрать в фильтре. */
export const CALLS_LIST_FILTER_MAX_ITEMS = 200;

/** Шкала оценки AI в фильтре — как на витрине. */
export const CALLS_LIST_SCORE_RANGE = { min: 1, max: 10 } as const;

/** Сколько живёт выборка периода в кэше: листание не перечитывает период. */
export const CALLS_LIST_TTL_SECONDS = 300;

/** Фильтр по отзывам руководителей. */
export const CALLS_LIST_REVIEW_FILTERS = [
    'any',
    'reviewed',
    'not_reviewed',
    'disagreed',
] as const;
export type CallsListReviewFilter = (typeof CALLS_LIST_REVIEW_FILTERS)[number];

/** Порядок строк. */
export const CALLS_LIST_SORTS = [
    'date_desc',
    'date_asc',
    'score_asc',
    'score_desc',
] as const;
export type CallsListSort = (typeof CALLS_LIST_SORTS)[number];

/** Кому открыт раздел: руководители по структуре (и суперпользователь). */
export const CALLS_LIST_ROLES = AI_ANALYTICS_LEADER_ROLES;

/** Тексты ошибок для человека: без кодов и названий сервисов. */
export const CALLS_LIST_MESSAGES = {
    leadersOnly: 'Раздел доступен руководителям',
    period: `Период — не длиннее ${CALLS_LIST_MAX_DAYS} дней, начало не позже конца`,
} as const;
