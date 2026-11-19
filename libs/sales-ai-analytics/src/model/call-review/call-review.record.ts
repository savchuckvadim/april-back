/**
 * Отзыв руководителя о разборе звонка как строка `ais` (вид `call_review`
 * обратной связи, техрешение ai/tasks/2026-11-19-call-reviews-design.md):
 * разбор строки в отзыв и «один актуальный на автора и звонок». Общая
 * часть стора приложения (страница звонка), админ-списка отзывов и
 * ежедневной сводки в Telegram. Чистые функции без DI и без Bitrix.
 */
import {
    parseCallReviewPayload,
    type AiAnalyticsCallReviewPayload,
} from '../../contracts/call-review.types';
import { isAiAnalyticsFeedbackKind } from '../../contracts/feedback.types';
import { AI_ANALYTICS_SNAPSHOT_STATUS } from '../../contracts/snapshot-kinds.const';

/** Поля строки `ais`, из которых читается отзыв (`AiEntityDto` подходит). */
export interface CallReviewSourceRecord {
    id: string;
    status?: string | null;
    createdAt: Date;
    transcription_id?: string | null;
    user_result?: unknown;
}

/** Актуальный отзыв руководителя о разборе звонка. */
export interface AiAnalyticsCallReviewRecord
    extends AiAnalyticsCallReviewPayload {
    /** Id записи `ais`. */
    id: string;
    createdAt: Date;
    /** Bitrix-id автора. */
    authorId: string;
    transcriptionId: string;
    /** Менеджер звонка; null — не записан. */
    managerId: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const asText = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

/** Bitrix-id пользователя: целое > 0 строкой; иначе null. */
export function callReviewUserIdOf(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const id = Number(String(value).trim());
    return Number.isInteger(id) && id > 0 ? String(id) : null;
}

/**
 * Строка `ais` → отзыв. Замещённая (superseded), чужого вида, без автора,
 * без звонка или с нагрузкой чужой формы — null: посторонняя строка не
 * роняет чтение.
 */
export function parseCallReviewRecord(
    record: CallReviewSourceRecord,
): AiAnalyticsCallReviewRecord | null {
    if (record.status === AI_ANALYTICS_SNAPSHOT_STATUS.superseded) return null;
    const feedback = asRecord(record.user_result);
    if (!feedback || !isAiAnalyticsFeedbackKind(feedback.kind)) return null;
    if (feedback.kind !== 'call_review' || !asText(feedback.object)) {
        return null;
    }
    const review = parseCallReviewPayload(feedback.payload);
    const authorId = callReviewUserIdOf(feedback.requesterUserId);
    const transcriptionId =
        asText(feedback.transcriptionId) ?? asText(record.transcription_id);
    if (review === null || authorId === null || transcriptionId === null) {
        return null;
    }
    return {
        ...review,
        id: record.id,
        createdAt: record.createdAt,
        authorId,
        transcriptionId,
        managerId: asText(feedback.managerId),
    };
}

/**
 * Актуальные отзывы из строк `ais`: по одному на автора и звонок — самый
 * свежий по id (стор и так держит один актуальный; это страховка от гонки
 * двух сохранений). Порядок — свежие сверху.
 */
export function latestCallReviews(
    records: readonly CallReviewSourceRecord[],
): AiAnalyticsCallReviewRecord[] {
    const latest = new Map<string, AiAnalyticsCallReviewRecord>();
    for (const record of records) {
        const review = parseCallReviewRecord(record);
        if (review === null) continue;
        const key = `${review.transcriptionId}:${review.authorId}`;
        const known = latest.get(key);
        if (!known || Number(review.id) > Number(known.id)) {
            latest.set(key, review);
        }
    }
    return [...latest.values()].sort(byNewestCallReview);
}

/** Свежие сверху; при равном времени — больший id выше. */
export function byNewestCallReview(
    a: AiAnalyticsCallReviewRecord,
    b: AiAnalyticsCallReviewRecord,
): number {
    return (
        b.createdAt.getTime() - a.createdAt.getTime() ||
        Number(b.id) - Number(a.id)
    );
}
