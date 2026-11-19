/**
 * Ответ админ-списка «Отзывы о разборах»: строки страницы и сводка за
 * период. Доменные типы — DTO их реализуют (`implements`).
 */
import type {
    AiAnalyticsCallReviewAuthorRole,
    AiAnalyticsCallReviewItemKind,
} from '../../contracts/call-review.types';
import type { CallReviewStats } from '../../model/call-review/call-review.stats';

/** Замечание «не так» в строке списка. */
export interface CallReviewAdminItem {
    kind: AiAnalyticsCallReviewItemKind;
    /** Вид словами. */
    kindTitle: string;
    label: string;
    comment: string;
}

/** Строка списка: один отзыв руководителя. */
export interface CallReviewAdminRow {
    /** Id записи отзыва в `ais`. */
    id: string;
    /** Когда оставлен отзыв, ISO. */
    createdAt: string;
    transcriptionId: string;
    /** Начало звонка, ISO; неизвестно — null. */
    callStartedAt: string | null;
    /** Публичная ссылка на страницу разбора; не выпускается — null. */
    callUrl: string | null;
    managerId: string | null;
    managerName: string | null;
    authorId: string;
    authorName: string;
    authorRole: AiAnalyticsCallReviewAuthorRole;
    authorRoleTitle: string;
    aiScore: number | null;
    leaderScore: number | null;
    agree: boolean;
    items: CallReviewAdminItem[];
    /** Комментарий целиком (обрезает фронт). */
    comment: string;
}

/** Страница списка со сводкой периода. */
export interface CallReviewsAdminPage {
    domain: string;
    from: string;
    to: string;
    items: CallReviewAdminRow[];
    /** Отзывов под фильтром. */
    total: number;
    page: number;
    pageSize: number;
    /** Сводка за период — без учёта фильтров согласия и вида «не так». */
    summary: CallReviewStats;
}
