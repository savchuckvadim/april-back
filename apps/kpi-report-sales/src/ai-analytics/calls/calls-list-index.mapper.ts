/**
 * Сборка выборки периода раздела «Разборы звонков» из lite-строк звонков и
 * записей обратной связи. Чистые функции без DI.
 */
import {
    callBadgesOf,
    parseCallReviewPayload,
    toScore10,
    type DatedLiteRow,
} from '@lib/sales-ai-analytics';
import { normalizeUserId } from '../domain/access/perimeter.util';
import type { AiAnalyticsFeedbackRecord } from '../store/ai-analytics-feedback.store';
import type { CallListReview, CallListRow } from './calls-list.types';
import { collectPointCodes, encodePoints } from './calls-list-points.util';

/** Звонки периода с разбором и коды пунктов методики, встретившиеся в них. */
export interface CallListRows {
    rows: CallListRow[];
    pointCodes: string[];
}

/**
 * Звонки периода с разбором — новые сверху — и коды пунктов методики
 * (по алфавиту): статусы пунктов каждого звонка записаны по этим кодам.
 * Звонок без глубокого разбора в раздел не попадает: страница такого
 * звонка открылась бы пустой.
 */
export function buildCallListRows(rows: readonly DatedLiteRow[]): CallListRows {
    const analysed = rows.filter(row => row.analysisPresent);
    const pointCodes = collectPointCodes(analysed);
    return {
        pointCodes,
        rows: analysed
            .map(row => ({
                transcriptionId: row.transcriptionId,
                managerId: normalizeUserId(row.managerId),
                startedAt: row.callStartedAt.toISOString(),
                durationSec:
                    typeof row.durationSec === 'number' && row.durationSec > 0
                        ? Math.round(row.durationSec)
                        : null,
                callType: row.callType,
                aiScore: toScore10(row.score),
                badges: callBadgesOf(row),
                points: encodePoints(row.methodology?.points, pointCodes),
            }))
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    };
}

/**
 * Актуальные отзывы руководителей по звонкам: вид `call_review`, нагрузка
 * читается, есть звонок и автор. На автора и звонок — один, самый свежий
 * (стор и так держит один актуальный; это страховка от гонки двух
 * сохранений).
 */
export function groupCallReviews(
    records: readonly AiAnalyticsFeedbackRecord[],
): Record<string, CallListReview[]> {
    const latest = new Map<
        string,
        { id: number; transcriptionId: string; review: CallListReview }
    >();
    for (const record of records) {
        if (record.kind !== 'call_review' || !record.transcriptionId) continue;
        const payload = parseCallReviewPayload(record.payload);
        const authorId = normalizeUserId(record.requesterUserId);
        if (payload === null || authorId === null) continue;
        const key = `${record.transcriptionId}:${authorId}`;
        const id = Number(record.id);
        const known = latest.get(key);
        if (known && known.id >= id) continue;
        latest.set(key, {
            id,
            transcriptionId: record.transcriptionId,
            review: {
                authorId,
                agree: payload.agree,
                leaderScore: payload.leaderScore,
                createdAt: record.createdAt.toISOString(),
            },
        });
    }
    const grouped: Record<string, CallListReview[]> = {};
    for (const { transcriptionId, review } of latest.values()) {
        (grouped[transcriptionId] ??= []).push(review);
    }
    return grouped;
}
