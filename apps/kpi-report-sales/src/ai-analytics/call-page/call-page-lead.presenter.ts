/**
 * Личная страница руководителя: зритель, его отзыв и отзывы коллег. Чистые
 * функции. Без права на отзыв отзывы не показываются вовсе — бывший
 * руководитель со старой ссылкой чужих отзывов не увидит.
 */
import {
    AI_ANALYTICS_CALL_REVIEW_LIMITS,
    toScore10,
    type AiAnalyticsCallReviewPayload,
} from '@lib/sales-ai-analytics';
import type { CallPageLeadPayload } from '@lib/call-lib';
import type { AiCallReviewRecord } from '../store/ai-analytics-call-review.store';
import type { CallPageAnalysisView } from './call-page.types';
import type {
    CallPageLeadReviewDto,
    CallPageLeadReviewRequestDto,
    CallPageLeadViewDto,
} from './dto/call-page-lead.dto';

/** Всё, из чего собирается личная страница. */
export interface CallPageLeadSource {
    lead: CallPageLeadPayload;
    viewerName: string | null;
    canReview: boolean;
    reviews: readonly AiCallReviewRecord[];
}

function presentReview(review: AiCallReviewRecord): CallPageLeadReviewDto {
    return {
        authorName: review.authorName,
        authorRole: review.authorRole,
        agree: review.agree,
        leaderScore: review.leaderScore,
        aiScore: review.aiScore,
        items: review.items.map(item => ({ ...item })),
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
    };
}

export function presentCallPageLead(
    source: CallPageLeadSource,
): CallPageLeadViewDto {
    const { lead, canReview } = source;
    const reviews = canReview ? source.reviews : [];
    const mine = reviews.find(review => review.authorId === lead.u) ?? null;
    return {
        viewer: {
            name: source.viewerName,
            role: lead.r,
            canReview,
            expiresAt: new Date(lead.e * 1000).toISOString(),
        },
        mine: mine ? presentReview(mine) : null,
        colleagues: reviews
            .filter(review => review.authorId !== lead.u)
            .map(presentReview),
    };
}

/**
 * Оценка AI на момент отзыва — по тому же правилу, что строка витрины:
 * взвешенная оценка разбора (0–100), у старых разборов — итоговая 1–10.
 */
export function analysisAiScore(view: CallPageAnalysisView): number | null {
    if (view.weightedScore !== null) return toScore10(view.weightedScore);
    return view.score;
}

/** Что сохраняем: тексты без пробелов по краям, пустые пункты отброшены. */
export function callReviewPayloadOf(
    dto: CallPageLeadReviewRequestDto,
    snapshot: {
        aiScore: number | null;
        analysisId: string;
        authorRole: CallPageLeadPayload['r'];
        authorName: string;
    },
): AiAnalyticsCallReviewPayload {
    return {
        agree: dto.agree,
        leaderScore: dto.leaderScore ?? null,
        aiScore: snapshot.aiScore,
        analysisId: snapshot.analysisId,
        items: (dto.items ?? []).map(item => ({
            kind: item.kind,
            ref: item.ref.trim(),
            label: item.label.trim(),
            comment: item.comment.trim(),
        })),
        comment: (dto.comment ?? '').trim(),
        authorRole: snapshot.authorRole,
        authorName: snapshot.authorName.slice(
            0,
            AI_ANALYTICS_CALL_REVIEW_LIMITS.authorName,
        ),
    };
}
