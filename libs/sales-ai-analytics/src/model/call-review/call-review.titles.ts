/**
 * Подписи отзыва руководителя для людей: вид замечания «не так» и роль
 * автора словами. Одни на админку и на сводку в Telegram — коды наружу не
 * показываются (правило клиентских текстов).
 */
import type {
    AiAnalyticsCallReviewAuthorRole,
    AiAnalyticsCallReviewItemKind,
} from '../../contracts/call-review.types';

/** К чему относится замечание «не так» — словами. */
export const CALL_REVIEW_ITEM_KIND_TITLES = {
    section: 'раздел',
    objection: 'возражение',
    methodology: 'пункт методики',
    fact: 'факт',
    call_type: 'тип звонка',
} as const satisfies Record<AiAnalyticsCallReviewItemKind, string>;

/** Кто оставил отзыв — словами. */
export const CALL_REVIEW_AUTHOR_ROLE_TITLES = {
    leader: 'руководитель',
    superuser: 'суперпользователь',
} as const satisfies Record<AiAnalyticsCallReviewAuthorRole, string>;

export const callReviewItemKindTitle = (
    kind: AiAnalyticsCallReviewItemKind,
): string => CALL_REVIEW_ITEM_KIND_TITLES[kind];

export const callReviewAuthorRoleTitle = (
    role: AiAnalyticsCallReviewAuthorRole,
): string => CALL_REVIEW_AUTHOR_ROLE_TITLES[role];
