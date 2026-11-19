/**
 * Константы админ-списка «Отзывы о разборах» (`GET admin/ai-analytics/
 * call-reviews`, этап 4 техрешения 2026-11-19-call-reviews-design.md).
 */

/** Пределы страницы списка отзывов. */
export const CALL_REVIEWS_ADMIN_PAGE = {
    defaultPageSize: 50,
    maxPageSize: 200,
} as const;

/** Самый длинный период одного запроса, дней: год — и ни днём больше. */
export const CALL_REVIEWS_ADMIN_MAX_DAYS = 366;

/** Фильтр «согласен с оценкой AI»: все, только согласные, только нет. */
export const CALL_REVIEWS_AGREE_FILTERS = ['all', 'yes', 'no'] as const;
export type CallReviewsAgreeFilter =
    (typeof CALL_REVIEWS_AGREE_FILTERS)[number];
