/**
 * Фильтры, порядок, страница, фасеты и сводка отзывов раздела «Разборы
 * звонков» поверх выборки периода. Чистые функции: периметр, фильтры и
 * автор «моего» отзыва приходят параметрами.
 */
import { pageOf } from '@lib/shared/lib/list-query';
import { callTypeTitle } from '../call-page/call-page-titles.util';
import {
    filterByPerimeter,
    type RequesterAccess,
} from '../domain/access/perimeter.util';
import type { CallsListSort } from './calls-list.const';
import type {
    CallListCallTypeFacet,
    CallListIndex,
    CallListManagerFacet,
    CallListQuery,
    CallListReview,
    CallListReviewsSummary,
    CallListRow,
} from './calls-list.types';

/** Звонки менеджеров, которых пользователь вправе видеть. */
export function visibleCallRows(
    index: CallListIndex,
    access: RequesterAccess,
): CallListRow[] {
    return filterByPerimeter(index.rows, access);
}

function matchesReview(
    reviews: readonly CallListReview[],
    filter: CallListQuery['review'],
): boolean {
    switch (filter) {
        case 'reviewed':
            return reviews.length > 0;
        case 'not_reviewed':
            return reviews.length === 0;
        case 'disagreed':
            return reviews.some(review => !review.agree);
        default:
            return true;
    }
}

function matchesScore(row: CallListRow, query: CallListQuery): boolean {
    if (query.scoreMin === null && query.scoreMax === null) return true;
    if (row.aiScore === null) return false;
    return (
        (query.scoreMin === null || row.aiScore >= query.scoreMin) &&
        (query.scoreMax === null || row.aiScore <= query.scoreMax)
    );
}

/** Строки под фильтры запроса (менеджеры, типы, оценка AI, отзывы). */
export function filterCallRows(
    rows: readonly CallListRow[],
    reviews: CallListIndex['reviews'],
    query: CallListQuery,
): CallListRow[] {
    const managers = new Set(query.managerIds);
    const types = new Set(query.callTypes);
    return rows.filter(
        row =>
            (managers.size === 0 ||
                (row.managerId !== null && managers.has(row.managerId))) &&
            (types.size === 0 ||
                (row.callType !== null && types.has(row.callType))) &&
            matchesScore(row, query) &&
            matchesReview(reviews[row.transcriptionId] ?? [], query.review),
    );
}

/** Новее — раньше; равное время — по номеру расшифровки (стабильно). */
function byDateDesc(a: CallListRow, b: CallListRow): number {
    return (
        b.startedAt.localeCompare(a.startedAt) ||
        Number(b.transcriptionId) - Number(a.transcriptionId)
    );
}

/** Порядок строк; звонки без оценки при сортировке по оценке — в конце. */
export function sortCallRows(
    rows: readonly CallListRow[],
    sort: CallsListSort,
): CallListRow[] {
    const sorted = [...rows];
    if (sort === 'date_desc') return sorted.sort(byDateDesc);
    if (sort === 'date_asc') return sorted.sort((a, b) => byDateDesc(b, a));
    const sign = sort === 'score_asc' ? 1 : -1;
    return sorted.sort((a, b) => {
        if (a.aiScore === null || b.aiScore === null) {
            if (a.aiScore === b.aiScore) return byDateDesc(a, b);
            return a.aiScore === null ? 1 : -1;
        }
        return sign * (a.aiScore - b.aiScore) || byDateDesc(a, b);
    });
}

/** Строки страницы (страницы с 1); за пределами — пусто. */
export function pageOfRows<T>(
    rows: readonly T[],
    page: number,
    pageSize: number,
): T[] {
    return pageOf(rows, page, pageSize);
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Сводка отзывов по звонку; «мой» — отзыв автора `requesterId`. */
export function summarizeCallReviews(
    reviews: readonly CallListReview[],
    requesterId: string | null,
): CallListReviewsSummary {
    const scores = reviews
        .map(review => review.leaderScore)
        .filter((score): score is number => score !== null);
    const mine = reviews.find(review => review.authorId === requesterId);
    const lastAt = reviews.reduce<string | null>(
        (last, review) =>
            last === null || review.createdAt > last ? review.createdAt : last,
        null,
    );
    return {
        count: reviews.length,
        disagreeCount: reviews.filter(review => !review.agree).length,
        avgLeaderScore:
            scores.length > 0
                ? round1(scores.reduce((sum, s) => sum + s, 0) / scores.length)
                : null,
        mine: mine
            ? { leaderScore: mine.leaderScore, agree: mine.agree }
            : null,
        lastAt,
    };
}

function countBy(
    rows: readonly CallListRow[],
    keyOf: (row: CallListRow) => string | null,
): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const key = keyOf(row);
        if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

/**
 * Фасеты по видимым звонкам периода (без фильтров запроса и страницы):
 * менеджеры по имени, типы звонка — по числу звонков.
 */
export function callListFacets(
    rows: readonly CallListRow[],
    managerNames: CallListIndex['managerNames'],
): { managers: CallListManagerFacet[]; callTypes: CallListCallTypeFacet[] } {
    const managers = [...countBy(rows, row => row.managerId)]
        .map(([id, count]) => ({ id, name: managerNames[id] ?? null, count }))
        .sort(
            (a, b) =>
                (a.name ?? '￿').localeCompare(b.name ?? '￿', 'ru') ||
                Number(a.id) - Number(b.id),
        );
    const callTypes = [...countBy(rows, row => row.callType)]
        .map(([code, count]) => ({ code, title: callTypeTitle(code), count }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    return { managers, callTypes };
}
