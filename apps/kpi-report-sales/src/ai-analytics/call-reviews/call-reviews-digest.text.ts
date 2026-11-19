/**
 * Текст ежедневной сводки отзывов руководителей о разборах звонков для
 * Telegram (этап 4 техрешения 2026-11-19-call-reviews-design.md). Чистые
 * функции: выбор комментариев, строки портала, сборка частей.
 *
 * Разметки нет: текст уходит через `TelegramService.sendMessage`, который
 * сам экранирует спецсимволы Markdown v1, — поэтому комментарии
 * руководителей идут как есть (без своего экранирования, иначе в чат
 * приехали бы обратные слеши), только сплющиваются в одну строку.
 */
import type {
    AiAnalyticsCallReviewRecord,
    CallReviewStats,
} from '@lib/sales-ai-analytics';
import { packDigestParts } from './call-reviews-digest.parts';

/** Комментариев на портал — не больше. */
export const CALL_REVIEWS_DIGEST_COMMENTS = 5;
/** Знаков комментария в сводке. */
export const CALL_REVIEWS_DIGEST_COMMENT_CHARS = 200;
/** Пунктов «чаще всего не так» в строке портала. */
export const CALL_REVIEWS_DIGEST_TOP_ITEMS = 3;

/** Комментарий руководителя в сводке. */
export interface CallReviewsDigestComment {
    authorName: string;
    agree: boolean;
    aiScore: number | null;
    leaderScore: number | null;
    comment: string;
    transcriptionId: string;
    /** Публичная ссылка на страницу разбора; нет — номер звонка. */
    url: string | null;
}

/** Портал в сводке: числа и выбранные комментарии. */
export interface CallReviewsDigestPortal {
    domain: string;
    stats: CallReviewStats;
    comments: CallReviewsDigestComment[];
}

/** Текст в одну строку: переводы строк и повторы пробелов — один пробел. */
const flatten = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Первые `max` знаков, обрезанный — с «…». */
export function shortComment(
    text: string,
    max: number = CALL_REVIEWS_DIGEST_COMMENT_CHARS,
): string {
    const flat = flatten(text);
    return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

/**
 * Отзывы с комментарием для сводки: сначала «не согласен», затем свежие;
 * не больше `limit`.
 */
export function pickDigestReviews(
    reviews: readonly AiAnalyticsCallReviewRecord[],
    limit: number = CALL_REVIEWS_DIGEST_COMMENTS,
): AiAnalyticsCallReviewRecord[] {
    return reviews
        .filter(review => flatten(review.comment) !== '')
        .sort(
            (a, b) =>
                Number(a.agree) - Number(b.agree) ||
                b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .slice(0, Math.max(0, limit));
}

/** Оценка: целая — без дробной части, иначе один знак через запятую. */
export const formatScore = (value: number | null): string =>
    value === null
        ? '—'
        : Number.isInteger(value)
          ? String(value)
          : value.toFixed(1).replace('.', ',');

const formatDiff = (value: number): string =>
    value === 0
        ? '0'
        : `${value > 0 ? '+' : '−'}${formatScore(Math.abs(value))}`;

/** YYYY-MM-DD → ДД.ММ.ГГГГ. */
const dayLabel = (day: string): string => day.split('-').reverse().join('.');

/** Главная строка портала: числа, оценки и частые «не так». */
export function portalSummaryLine(portal: CallReviewsDigestPortal): string {
    const { stats } = portal;
    const diff =
        stats.avgScoreDiff === null
            ? ''
            : ` (разница ${formatDiff(stats.avgScoreDiff)})`;
    const top = stats.topItems
        .slice(0, CALL_REVIEWS_DIGEST_TOP_ITEMS)
        .map(item => `«${item.label}» (${item.kindTitle}) — ${item.count}`);
    return (
        `${portal.domain}: отзывов ${stats.total}, не согласны ${stats.disagree}; ` +
        `оценка AI в среднем ${formatScore(stats.avgAiScore)}, ` +
        `руководителей ${formatScore(stats.avgLeaderScore)}${diff}; ` +
        (top.length > 0
            ? `чаще всего «не так»: ${top.join(', ')}`
            : 'замечаний «не так» нет')
    );
}

/** Строка комментария: автор, согласие, оценки, текст и ссылка. */
export function commentLine(comment: CallReviewsDigestComment): string {
    const agree = comment.agree ? 'согласен' : 'не согласен';
    const scores = `AI ${formatScore(comment.aiScore)} → ${formatScore(comment.leaderScore)}`;
    const link = comment.url ?? `звонок ${comment.transcriptionId}`;
    const author = flatten(comment.authorName) || 'Руководитель';
    return `• ${author}, ${agree}, ${scores}: ${shortComment(comment.comment)} ${link}`;
}

/**
 * Сводка за день по порталам → части сообщения (не длиннее предела
 * Telegram). Ни у одного портала нет отзывов — null: слать нечего.
 */
export function buildCallReviewsDigest(
    day: string,
    portals: readonly CallReviewsDigestPortal[],
): string[] | null {
    const withReviews = portals.filter(portal => portal.stats.total > 0);
    if (withReviews.length === 0) return null;
    const header = `Отзывы руководителей о разборах звонков за ${dayLabel(day)}`;
    const blocks = withReviews.map(portal => [
        portalSummaryLine(portal),
        ...portal.comments.map(commentLine),
    ]);
    return packDigestParts(header, blocks);
}
