/**
 * Сводка отзывов руководителей о разборах звонков за период: сколько
 * отзывов и несогласий, средние оценки AI и руководителей, замечания «не
 * так» по видам и самые частые пункты. Одна на админ-список и на сводку в
 * Telegram. Чистые функции.
 */
import {
    AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
    type AiAnalyticsCallReviewItemKind,
    type AiAnalyticsCallReviewPayload,
} from '../../contracts/call-review.types';
import { callReviewItemKindTitle } from './call-review.titles';

/** Сколько пунктов в топе «не так» по умолчанию. */
export const CALL_REVIEW_TOP_ITEMS = 10;

/** Замечания «не так» одного вида. */
export interface CallReviewKindCount {
    kind: AiAnalyticsCallReviewItemKind;
    /** Вид словами: «раздел», «возражение»… */
    title: string;
    count: number;
}

/** Пункт «не так», который отмечали чаще других. */
export interface CallReviewTopItem {
    kind: AiAnalyticsCallReviewItemKind;
    kindTitle: string;
    /** Подпись пункта (как в первом отзыве с ним). */
    label: string;
    count: number;
}

/** Сводка отзывов за период. */
export interface CallReviewStats {
    total: number;
    /** «Не согласен с оценкой AI». */
    disagree: number;
    /** Доля несогласных, % с одним знаком; отзывов нет — null. */
    disagreePct: number | null;
    /** Средняя оценка AI (1–10) по отзывам, где она была; нет — null. */
    avgAiScore: number | null;
    /** Средняя оценка руководителей (1–10); никто не ставил — null. */
    avgLeaderScore: number | null;
    /**
     * Средняя разница «руководитель − AI» по отзывам, где есть обе
     * оценки: минус — руководители строже модели; нет пар — null.
     */
    avgScoreDiff: number | null;
    /** Замечания «не так» по видам — все виды в постоянном порядке. */
    itemKinds: CallReviewKindCount[];
    /** Самые частые пункты «не так», сначала частые. */
    topItems: CallReviewTopItem[];
}

/** Что из отзыва нужно сводке. */
export type CallReviewStatsInput = Pick<
    AiAnalyticsCallReviewPayload,
    'agree' | 'aiScore' | 'leaderScore' | 'items'
>;

const round1 = (value: number): number => Math.round(value * 10) / 10;

const average = (values: readonly number[]): number | null =>
    values.length === 0
        ? null
        : round1(values.reduce((sum, value) => sum + value, 0) / values.length);

const numbers = (values: readonly (number | null)[]): number[] =>
    values.filter((value): value is number => value !== null);

/** Подпись пункта без лишних пробелов; пустая — код пункта. */
const labelOf = (item: { label: string; ref: string }): string =>
    (item.label.trim() || item.ref.trim()).replace(/\s+/g, ' ');

function countKinds(
    reviews: readonly CallReviewStatsInput[],
): CallReviewKindCount[] {
    return AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS.map(kind => ({
        kind,
        title: callReviewItemKindTitle(kind),
        count: reviews.reduce(
            (sum, review) =>
                sum + review.items.filter(item => item.kind === kind).length,
            0,
        ),
    }));
}

/** Частые пункты: вид + подпись без учёта регистра. */
export function topCallReviewItems(
    reviews: readonly CallReviewStatsInput[],
    limit: number = CALL_REVIEW_TOP_ITEMS,
): CallReviewTopItem[] {
    const counts = new Map<string, CallReviewTopItem>();
    for (const review of reviews) {
        for (const item of review.items) {
            const label = labelOf(item);
            if (label === '') continue;
            const key = `${item.kind}:${label.toLowerCase()}`;
            const known = counts.get(key);
            if (known) {
                known.count += 1;
                continue;
            }
            counts.set(key, {
                kind: item.kind,
                kindTitle: callReviewItemKindTitle(item.kind),
                label,
                count: 1,
            });
        }
    }
    const kindOrder = (kind: AiAnalyticsCallReviewItemKind): number =>
        AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS.indexOf(kind);
    return [...counts.values()]
        .sort(
            (a, b) =>
                b.count - a.count ||
                kindOrder(a.kind) - kindOrder(b.kind) ||
                a.label.localeCompare(b.label, 'ru'),
        )
        .slice(0, Math.max(0, limit));
}

/** Сводка отзывов периода. */
export function summarizeCallReviews(
    reviews: readonly CallReviewStatsInput[],
    topLimit: number = CALL_REVIEW_TOP_ITEMS,
): CallReviewStats {
    const total = reviews.length;
    const disagree = reviews.filter(review => !review.agree).length;
    const pairs = reviews.flatMap(review =>
        review.aiScore !== null && review.leaderScore !== null
            ? [review.leaderScore - review.aiScore]
            : [],
    );
    return {
        total,
        disagree,
        disagreePct: total === 0 ? null : round1((disagree / total) * 100),
        avgAiScore: average(numbers(reviews.map(review => review.aiScore))),
        avgLeaderScore: average(
            numbers(reviews.map(review => review.leaderScore)),
        ),
        avgScoreDiff: average(pairs),
        itemKinds: countKinds(reviews),
        topItems: topCallReviewItems(reviews, topLimit),
    };
}
