/**
 * Отзыв руководителя на разбор звонка с сайта продукта (страница
 * «Что нужно от руководителя», анкета rop-review → маршрут сайта
 * `/api/rop-review` → `POST ai-analytics/review`). Руководитель не в
 * фрейме Bitrix, поэтому ручка открытая: идентификация — ссылка на карточку
 * разбора (домен + смарт + элемент), защита — проверка смарта портала и
 * лимит отправок с одного адреса.
 *
 * Отзыв хранится записью обратной связи (`ai-analytics-feedback`): согласие —
 * kind useful, частичное/несогласие — kind disagree, детали — в payload.
 */
export const AI_REVIEW_ROUTE = 'review';

/** Источник записи в payload обратной связи. */
export const AI_REVIEW_SOURCE = 'site';

/** Префикс object записи обратной связи: `site-review:{itemId}`. */
export const AI_REVIEW_FEEDBACK_OBJECT_PREFIX = 'site-review';

export const AI_REVIEW_AUTHOR_ROLES = [
    'rop',
    'group_head',
    'director',
    'other',
] as const;
export type AiReviewAuthorRole = (typeof AI_REVIEW_AUTHOR_ROLES)[number];

export const AI_REVIEW_AUTHOR_ROLE_LABELS: Record<AiReviewAuthorRole, string> =
    {
        rop: 'руководитель отдела продаж',
        group_head: 'руководитель группы',
        director: 'директор',
        other: 'другое',
    };

export const AI_REVIEW_VERDICTS = ['agree', 'partly', 'disagree'] as const;
export type AiReviewVerdict = (typeof AI_REVIEW_VERDICTS)[number];

export const AI_REVIEW_VERDICT_LABELS: Record<AiReviewVerdict, string> = {
    agree: 'согласен с разбором',
    partly: 'согласен частично',
    disagree: 'не согласен',
};

export const AI_REVIEW_ISSUES = [
    'call_type',
    'score',
    'facts',
    'recommendations',
    'links',
    'transcript',
    'other',
] as const;
export type AiReviewIssue = (typeof AI_REVIEW_ISSUES)[number];

export const AI_REVIEW_ISSUE_LABELS: Record<AiReviewIssue, string> = {
    call_type: 'тип звонка определён неверно',
    score: 'оценка завышена или занижена',
    facts: 'факты, хвост или 5К не совпадают',
    recommendations: 'рекомендации не по делу',
    links: 'связь со сделкой/лидом неверная',
    transcript: 'транскрипт с ошибками',
    other: 'другое',
};

/** Длины полей отзыва (символов). */
export const AI_REVIEW_LIMITS = {
    link: 300,
    authorName: 200,
    comment: 2000,
    contact: 200,
    protocol: 10_000,
} as const;

/** Лимит отправок с одного адреса: окно и максимум. */
export const AI_REVIEW_RATE_LIMIT = {
    max: 10,
    windowMs: 10 * 60_000,
} as const;

export const AI_REVIEW_MESSAGES = {
    badLink:
        'Ссылка должна вести на карточку разбора звонка: ' +
        'https://портал.bitrix24.ru/crm/type/{тип}/details/{элемент}/',
    smartNotFound: (domain: string): string =>
        `На портале ${domain} смарт-процесс «AI-анализ звонков» не найден — ` +
        'проверьте адрес портала в ссылке',
    wrongSmart:
        'Ссылка ведёт не на разбор звонка: это другой смарт-процесс портала',
    commentRequired:
        'При частичном согласии или несогласии напишите, что именно не так',
    rateLimited: 'Слишком много отправок с вашего адреса — подождите немного',
} as const;
