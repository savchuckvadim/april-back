import { Injectable } from '@nestjs/common';
import { AiEntityDto, AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_FEEDBACK_TYPE,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    callReviewObjectOf,
    parseCallReviewPayload,
    type AiAnalyticsCallReviewPayload,
} from '@lib/sales-ai-analytics';
import { normalizeUserId } from '../domain/access/perimeter.util';
import {
    AiAnalyticsFeedbackStore,
    parseFeedbackPayload,
} from './ai-analytics-feedback.store';

/** Актуальный отзыв руководителя о разборе звонка. */
export interface AiCallReviewRecord extends AiAnalyticsCallReviewPayload {
    id: string;
    createdAt: Date;
    /** Bitrix-id автора. */
    authorId: string;
    transcriptionId: string;
    managerId: string | null;
}

/** Что пишем: звонок, автор и сам отзыв. */
export interface AiCallReviewSaveInput {
    domain: string;
    transcriptionId: string;
    /** Менеджер звонка (для сводок по менеджеру). */
    managerId: string | null;
    authorId: string;
    review: AiAnalyticsCallReviewPayload;
}

/** Запись `ais` → отзыв; чужой вид или форма — null. */
export function toCallReviewRecord(
    record: AiEntityDto,
): AiCallReviewRecord | null {
    if (record.status === AI_ANALYTICS_SNAPSHOT_STATUS.superseded) return null;
    const feedback = parseFeedbackPayload(record.user_result);
    if (feedback?.kind !== 'call_review') return null;
    const review = parseCallReviewPayload(feedback.payload);
    const authorId = normalizeUserId(feedback.requesterUserId);
    const transcriptionId =
        feedback.transcriptionId ?? (record.transcription_id || null);
    if (review === null || authorId === null || !transcriptionId) return null;
    return {
        ...review,
        id: record.id,
        createdAt: record.createdAt,
        authorId,
        transcriptionId,
        managerId: feedback.managerId,
    };
}

/**
 * Отзывы руководителей о разборе звонка (вид `call_review` обратной
 * связи): чтение по звонку и запись «один актуальный на автора и звонок» —
 * прежний отзыв автора уходит в superseded, история не удаляется (как у
 * меток rop_mark). Пишет только личная страница разбора; менеджеру эти
 * записи не отдаются.
 *
 * Bitrix не участвует, портал приходит параметром.
 */
@Injectable()
export class AiAnalyticsCallReviewStore {
    constructor(
        private readonly aiService: AiService,
        private readonly feedback: AiAnalyticsFeedbackStore,
    ) {}

    /** Актуальные отзывы по звонку — по одному (свежему) на автора. */
    async listForCall(
        domain: string,
        transcriptionId: string,
    ): Promise<AiCallReviewRecord[]> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            AI_ANALYTICS_FEEDBACK_TYPE,
            { transcriptionIds: [transcriptionId] },
        );
        const latest = new Map<string, AiCallReviewRecord>();
        for (const record of records) {
            const review = toCallReviewRecord(record);
            if (review === null || review.transcriptionId !== transcriptionId) {
                continue;
            }
            const known = latest.get(review.authorId);
            if (!known || Number(review.id) > Number(known.id)) {
                latest.set(review.authorId, review);
            }
        }
        return [...latest.values()].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
    }

    /** Пишет отзыв; прежние отзывы автора по звонку — superseded. */
    async save(
        input: AiCallReviewSaveInput,
    ): Promise<{ id: string; replacedIds: string[] }> {
        const records = await this.aiService.findByDomainTypeKeys(
            input.domain,
            AI_ANALYTICS_FEEDBACK_TYPE,
            { transcriptionIds: [input.transcriptionId] },
        );
        const previous = records
            .map(record => toCallReviewRecord(record))
            .filter(
                (review): review is AiCallReviewRecord =>
                    review !== null && review.authorId === input.authorId,
            )
            .map(review => review.id);
        const replacedIds = await this.feedback.supersede(previous);
        const id = await this.feedback.add({
            domain: input.domain,
            kind: 'call_review',
            object: callReviewObjectOf(input.transcriptionId),
            managerId: input.managerId,
            transcriptionId: input.transcriptionId,
            requesterUserId: input.authorId,
            reason: null,
            payload: { ...input.review },
        });
        return { id, replacedIds };
    }
}
