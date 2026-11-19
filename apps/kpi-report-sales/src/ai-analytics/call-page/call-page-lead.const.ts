/**
 * Личная страница разбора руководителя (`/call/<ключ звонка>/lead/<личный
 * ключ>`): маршруты, частота сохранений и тексты для человека.
 */

/** Отзывы по звонку и данные зрителя по личному ключу. */
export const CALL_PAGE_LEAD_ROUTE = 'call-page/:token/lead/:lead' as const;
/** Сохранение своего отзыва. */
export const CALL_PAGE_LEAD_REVIEW_ROUTE =
    'call-page/:token/lead/:lead/review' as const;

/** Не чаще стольких сохранений в минуту на один личный ключ. */
export const CALL_PAGE_REVIEW_RATE_LIMIT = { max: 10, windowSec: 60 } as const;

/** Тексты ошибок для человека: без кодов и названий сервисов. */
export const CALL_PAGE_LEAD_MESSAGES = {
    invalid: 'Ссылка недействительна',
    expired: 'Срок ссылки истёк — откройте разбор из отчёта KPI заново',
    forbidden: 'Оставить отзыв может руководитель этого сотрудника',
    tooOften: 'Слишком часто — подождите минуту и сохраните ещё раз',
} as const;
