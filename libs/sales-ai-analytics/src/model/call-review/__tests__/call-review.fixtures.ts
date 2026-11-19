import type { CallReviewSourceRecord } from '../call-review.record';

/** Нагрузка отзыва `call_review` с подменой полей. */
export const reviewPayload = (
    fields: Record<string, unknown> = {},
): Record<string, unknown> => ({
    agree: true,
    leaderScore: 7,
    aiScore: 6.4,
    analysisId: '900',
    items: [],
    comment: '',
    authorRole: 'leader',
    authorName: 'Петров Пётр',
    ...fields,
});

/** Строка `ais` отзыва: id, автор, звонок, момент и нагрузка. */
export function reviewRecord(
    id: string,
    options: {
        author?: string;
        transcriptionId?: string;
        managerId?: string | null;
        at?: string;
        status?: string;
        kind?: string;
        payload?: Record<string, unknown>;
    } = {},
): CallReviewSourceRecord {
    const transcriptionId = options.transcriptionId ?? '10245';
    return {
        id,
        status: options.status ?? 'done',
        createdAt: new Date(options.at ?? '2026-11-18T09:00:00.000Z'),
        transcription_id: transcriptionId,
        user_result: {
            kind: options.kind ?? 'call_review',
            object: `call:${transcriptionId}`,
            managerId:
                options.managerId === undefined ? '447' : options.managerId,
            transcriptionId,
            requesterUserId: options.author ?? '12',
            reason: null,
            payload: options.payload ?? reviewPayload(),
        },
    };
}
