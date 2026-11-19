/**
 * Чистые функции админ-списка «Отзывы о разборах»: окно периода по
 * Москве, фильтры и строка списка. Без DI, Prisma и Bitrix.
 */
import { moscowDayStart } from '@lib/call-lib/admin-list/admin-list.util';
import type { AiAnalyticsCallReviewItemKind } from '../../contracts/call-review.types';
import {
    callReviewUserIdOf,
    type AiAnalyticsCallReviewRecord,
} from '../../model/call-review/call-review.record';
import {
    callReviewAuthorRoleTitle,
    callReviewItemKindTitle,
} from '../../model/call-review/call-review.titles';
import {
    CALL_REVIEWS_ADMIN_MAX_DAYS,
    type CallReviewsAgreeFilter,
} from './call-reviews-admin.const';
import type { CallReviewAdminRow } from './call-reviews-admin.types';
import type { CallReviewCallHead } from './call-reviews-calls.reader';

const DAY_MS = 86_400_000;

/** Окно created_at периода: [начало from, начало дня после to) по Москве. */
export type CallReviewsWindow =
    | { ok: true; from: Date; to: Date }
    | { ok: false; reason: string };

/** Дни периода → окно; кривые даты, обратный или длинный период — причина. */
export function callReviewsWindow(from: string, to: string): CallReviewsWindow {
    const start = moscowDayStart(from);
    const lastDay = moscowDayStart(to);
    if (start === null || lastDay === null) {
        return { ok: false, reason: 'Даты периода — в виде YYYY-MM-DD' };
    }
    if (start.getTime() > lastDay.getTime()) {
        return { ok: false, reason: 'Начало периода позже конца' };
    }
    const end = new Date(lastDay.getTime() + DAY_MS);
    if (
        (end.getTime() - start.getTime()) / DAY_MS >
        CALL_REVIEWS_ADMIN_MAX_DAYS
    ) {
        return {
            ok: false,
            reason: `Период — не длиннее ${CALL_REVIEWS_ADMIN_MAX_DAYS} дней`,
        };
    }
    return { ok: true, from: start, to: end };
}

/** Фильтры списка: согласие с оценкой AI и вид замечания «не так». */
export interface CallReviewsFilter {
    agree?: CallReviewsAgreeFilter;
    itemKind?: AiAnalyticsCallReviewItemKind;
}

/** Отзывы под фильтрами; порядок сохраняется. */
export function filterCallReviews(
    reviews: readonly AiAnalyticsCallReviewRecord[],
    filter: CallReviewsFilter,
): AiAnalyticsCallReviewRecord[] {
    const agree = filter.agree ?? 'all';
    return reviews.filter(review => {
        if (agree === 'yes' && !review.agree) return false;
        if (agree === 'no' && review.agree) return false;
        return (
            !filter.itemKind ||
            review.items.some(item => item.kind === filter.itemKind)
        );
    });
}

/**
 * Менеджер строки: из отзыва, иначе из расшифровки. Имя — из расшифровки,
 * если это тот же сотрудник (иначе имя чужого человека ввело бы в
 * заблуждение).
 */
function managerOf(
    review: AiAnalyticsCallReviewRecord,
    head: CallReviewCallHead | undefined,
): { managerId: string | null; managerName: string | null } {
    const headUserId = callReviewUserIdOf(head?.userId ?? null);
    const managerId = review.managerId ?? headUserId;
    const sameUser = managerId !== null && managerId === headUserId;
    const name = head?.userName?.trim() ?? '';
    return { managerId, managerName: sameUser && name !== '' ? name : null };
}

/** Отзыв → строка списка (комментарий целиком: обрезает фронт). */
export function toCallReviewAdminRow(
    review: AiAnalyticsCallReviewRecord,
    head: CallReviewCallHead | undefined,
    callUrl: string | null,
): CallReviewAdminRow {
    return {
        id: review.id,
        createdAt: review.createdAt.toISOString(),
        transcriptionId: review.transcriptionId,
        callStartedAt: head?.callStartedAt?.toISOString() ?? null,
        callUrl,
        ...managerOf(review, head),
        authorId: review.authorId,
        authorName: review.authorName,
        authorRole: review.authorRole,
        authorRoleTitle: callReviewAuthorRoleTitle(review.authorRole),
        aiScore: review.aiScore,
        leaderScore: review.leaderScore,
        agree: review.agree,
        items: review.items.map(item => ({
            kind: item.kind,
            kindTitle: callReviewItemKindTitle(item.kind),
            label: item.label,
            comment: item.comment,
        })),
        comment: review.comment,
    };
}
