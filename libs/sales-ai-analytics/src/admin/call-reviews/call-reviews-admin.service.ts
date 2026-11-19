import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService, CallPageLinkService } from '@lib/call-lib';
import { adminPageBounds } from '@lib/call-lib/admin-list/admin-list.util';
import { AI_ANALYTICS_FEEDBACK_TYPE } from '../../contracts/feedback.types';
import { latestCallReviews } from '../../model/call-review/call-review.record';
import { summarizeCallReviews } from '../../model/call-review/call-review.stats';
import { CALL_REVIEWS_ADMIN_PAGE } from './call-reviews-admin.const';
import type { CallReviewsAdminPage } from './call-reviews-admin.types';
import {
    callReviewsWindow,
    filterCallReviews,
    toCallReviewAdminRow,
} from './call-reviews-admin.view';
import { CallReviewsCallsReader } from './call-reviews-calls.reader';
import type { CallReviewsAdminQueryDto } from './dto/call-reviews-admin-query.dto';

/**
 * Админ-список «Отзывы о разборах» (этап 4 техрешения
 * 2026-11-19-call-reviews-design.md): актуальные отзывы руководителей
 * портала за период — одним чтением записей обратной связи, фильтр и
 * страница в памяти (отзывов за период — десятки, не тысячи), сводка — по
 * всему периоду без фильтров.
 *
 * К строкам страницы дочитываются менеджер и начало звонка (строки
 * расшифровок) и ПУБЛИЧНЫЕ ссылки на страницы разбора — без личного ключа
 * руководителя: из админки отзыв не оставляют. Только чтение; Bitrix не
 * участвует, портал — параметром.
 */
@Injectable()
export class CallReviewsAdminService {
    constructor(
        private readonly aiService: AiService,
        private readonly calls: CallReviewsCallsReader,
        private readonly links: CallPageLinkService,
    ) {}

    async page(query: CallReviewsAdminQueryDto): Promise<CallReviewsAdminPage> {
        const window = callReviewsWindow(query.from, query.to);
        if (!window.ok) throw new BadRequestException(window.reason);
        const records = await this.aiService.findByDomainTypesInPeriod(
            query.domain,
            [AI_ANALYTICS_FEEDBACK_TYPE],
            window.from,
            window.to,
        );
        // Граница «по» — начало следующего дня, сам момент уже чужой.
        const reviews = latestCallReviews(records).filter(
            review => review.createdAt.getTime() < window.to.getTime(),
        );
        const filtered = filterCallReviews(reviews, query);
        const { page, pageSize } = adminPageBounds(
            query,
            CALL_REVIEWS_ADMIN_PAGE,
        );
        const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
        const ids = [...new Set(slice.map(review => review.transcriptionId))];
        const [heads, urls] = await Promise.all([
            this.calls.headsOf(query.domain, ids),
            this.links.urlsFor(query.domain, ids),
        ]);
        return {
            domain: query.domain,
            from: query.from,
            to: query.to,
            items: slice.map(review =>
                toCallReviewAdminRow(
                    review,
                    heads.get(review.transcriptionId),
                    urls.get(review.transcriptionId) ?? null,
                ),
            ),
            total: filtered.length,
            page,
            pageSize,
            summary: summarizeCallReviews(reviews),
        };
    }
}
