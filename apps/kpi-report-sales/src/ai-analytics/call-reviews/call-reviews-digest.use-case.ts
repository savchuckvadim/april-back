import { Injectable, Logger } from '@nestjs/common';
import { AiService, CallPageLinkService } from '@lib/call-lib';
import {
    AI_ANALYTICS_FEEDBACK_TYPE,
    latestCallReviews,
    summarizeCallReviews,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import {
    previousMoscowDay,
    type CallReviewsDigestWindow,
} from './call-reviews-digest.window';
import {
    buildCallReviewsDigest,
    CALL_REVIEWS_DIGEST_TOP_ITEMS,
    pickDigestReviews,
    type CallReviewsDigestPortal,
} from './call-reviews-digest.text';

/** Готовая сводка: день и части сообщения (null — отзывов не было). */
export interface CallReviewsDigestResult {
    day: string;
    parts: string[] | null;
}

/**
 * Сборка ежедневной сводки отзывов о разборах: по каждому порталу
 * AI-аналитики — актуальные отзывы руководителей за прошлые сутки по
 * Москве (одно чтение записей обратной связи за окно), их сводка и до пяти
 * комментариев с ПУБЛИЧНЫМИ ссылками на страницы разбора (без личного
 * ключа руководителя). Сбой одного портала не роняет остальные.
 *
 * Отправка и замок — у планировщика; здесь Bitrix не участвует, портал —
 * параметром.
 */
@Injectable()
export class CallReviewsDigestUseCase {
    private readonly logger = new Logger(CallReviewsDigestUseCase.name);

    constructor(
        private readonly portals: AiAnalyticsPortalsLoader,
        private readonly aiService: AiService,
        private readonly links: CallPageLinkService,
    ) {}

    async build(now: Date = new Date()): Promise<CallReviewsDigestResult> {
        const window = previousMoscowDay(now);
        const domains = await this.portals.listDomains();
        const portals: CallReviewsDigestPortal[] = [];
        for (const domain of domains) {
            try {
                const portal = await this.portalOf(domain, window);
                if (portal !== null) portals.push(portal);
            } catch (error) {
                this.logger.warn(
                    `Сводка отзывов о разборах ${domain}: портал пропущен — ${(error as Error).message}`,
                );
            }
        }
        return {
            day: window.day,
            parts: buildCallReviewsDigest(window.day, portals),
        };
    }

    private async portalOf(
        domain: string,
        window: CallReviewsDigestWindow,
    ): Promise<CallReviewsDigestPortal | null> {
        const records = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [AI_ANALYTICS_FEEDBACK_TYPE],
            window.from,
            window.to,
        );
        // Граница «по» — полночь следующего дня, сам момент уже чужой.
        const reviews = latestCallReviews(records).filter(
            review => review.createdAt.getTime() < window.to.getTime(),
        );
        if (reviews.length === 0) return null;
        const picked = pickDigestReviews(reviews);
        const urls = await this.links.urlsFor(domain, [
            ...new Set(picked.map(review => review.transcriptionId)),
        ]);
        return {
            domain,
            stats: summarizeCallReviews(reviews, CALL_REVIEWS_DIGEST_TOP_ITEMS),
            comments: picked.map(review => ({
                authorName: review.authorName,
                agree: review.agree,
                aiScore: review.aiScore,
                leaderScore: review.leaderScore,
                comment: review.comment,
                transcriptionId: review.transcriptionId,
                url: urls.get(review.transcriptionId) ?? null,
            })),
        };
    }
}
