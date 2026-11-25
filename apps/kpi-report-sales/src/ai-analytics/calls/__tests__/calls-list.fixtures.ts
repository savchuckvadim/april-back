import type { CheckpointStatus } from '@lib/call-lib/call-report/methodology/methodology.types';
import { encodePoints, pointIndexMap } from '../calls-list-points.util';
import type {
    CallListBadgeContext,
    CallListIndex,
    CallListPointDef,
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
    badges: [],
    points: '',
    ...fields,
});

/** Статусы пунктов звонка в записи по кодам выборки (нет в `statuses` — не проверялся). */
export const pointsOf = (
    codes: readonly string[],
    statuses: Record<string, CheckpointStatus>,
): string =>
    encodePoints(
        Object.entries(statuses).map(([code, status]) => ({ code, status })),
        codes,
    );

/** Пункт методики портала для фильтров. */
export const pointDefOf = (
    code: string,
    fields: Partial<CallListPointDef> = {},
): CallListPointDef => ({
    code,
    label: `Пункт ${code}`,
    title: `Формулировка пункта ${code}`,
    callTypes: ['presentation'],
    main: false,
    ...fields,
});

/** Контекст фильтров по бейджам: описания пунктов и коды выборки. */
export const badgeContextOf = (
    pointDefs: readonly CallListPointDef[],
    pointCodes: readonly string[],
): CallListBadgeContext => ({
    pointIndex: pointIndexMap(pointCodes),
    pointDefs,
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
    badges: [],
    points: [],
    sort: 'date_desc',
    page: 1,
    pageSize: 25,
    ...fields,
});

export const indexOf = (
    rows: CallListRow[],
    reviews: CallListIndex['reviews'] = {},
    managerNames: CallListIndex['managerNames'] = {},
    pointCodes: string[] = [],
): CallListIndex => ({ rows, pointCodes, reviews, managerNames });
