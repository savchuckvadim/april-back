import type {
    CallListIndex,
    CallListQuery,
    CallListReview,
    CallListRow,
} from '../calls-list.types';

/** Строка выборки с разумными значениями по умолчанию. */
export const rowOf = (
    transcriptionId: string,
    fields: Partial<CallListRow> = {},
): CallListRow => ({
    transcriptionId,
    managerId: '447',
    startedAt: '2026-11-10T08:00:00.000Z',
    durationSec: 120,
    callType: 'cold',
    aiScore: 5,
    ...fields,
});

export const reviewOf = (
    authorId: string,
    fields: Partial<CallListReview> = {},
): CallListReview => ({
    authorId,
    agree: true,
    leaderScore: 6,
    createdAt: '2026-11-11T08:00:00.000Z',
    ...fields,
});

export const queryOf = (
    fields: Partial<CallListQuery> = {},
): CallListQuery => ({
    managerIds: [],
    callTypes: [],
    scoreMin: null,
    scoreMax: null,
    review: 'any',
    sort: 'date_desc',
    page: 1,
    pageSize: 25,
    ...fields,
});

export const indexOf = (
    rows: CallListRow[],
    reviews: CallListIndex['reviews'] = {},
    managerNames: CallListIndex['managerNames'] = {},
): CallListIndex => ({ rows, reviews, managerNames });
