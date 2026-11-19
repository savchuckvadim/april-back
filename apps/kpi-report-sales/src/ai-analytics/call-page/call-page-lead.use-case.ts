import {
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { pickActiveAnalysis } from '@lib/call-lib';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { normalizeUserId } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { resetFeedbackCaches } from '../domain/use-cases/feedback-cache-reset.util';
import { AiAnalyticsCallReviewStore } from '../store/ai-analytics-call-review.store';
import { readCallPageAnalysis } from './call-page-analysis.reader';
import {
    CallPageLeadAccess,
    canReviewCall,
    type CallPageLeadContext,
} from './call-page-lead.access';
import { CALL_PAGE_LEAD_MESSAGES } from './call-page-lead.const';
import {
    analysisAiScore,
    callReviewPayloadOf,
    presentCallPageLead,
} from './call-page-lead.presenter';
import { CallPageManagerNameService } from './call-page-manager-name.service';
import { CALL_PAGE_MESSAGES } from './call-page.const';
import { CallReviewRateLimiter } from './call-review-rate-limit';
import type {
    CallPageLeadReviewRequestDto,
    CallPageLeadViewDto,
} from './dto/call-page-lead.dto';

/**
 * Личная страница разбора руководителя: отзывы по звонку и сохранение
 * своего отзыва.
 *
 * Ключ — не сессия: право на отзыв перепроверяется по структуре отделов
 * при КАЖДОМ открытии и сохранении (`RequesterAccessService.resolve`):
 * руководитель или суперпользователь, и менеджер звонка в периметре.
 * Права нет — страница без отзывов, сохранение — 403. После записи
 * сбрасывается выборка раздела «Разборы звонков» портала.
 */
@Injectable()
export class CallPageLeadUseCase {
    private readonly logger = new Logger(CallPageLeadUseCase.name);

    constructor(
        private readonly leadAccess: CallPageLeadAccess,
        private readonly access: RequesterAccessService,
        private readonly reviews: AiAnalyticsCallReviewStore,
        private readonly names: CallPageManagerNameService,
        private readonly rate: CallReviewRateLimiter,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async view(
        callToken: string,
        leadToken: string,
    ): Promise<CallPageLeadViewDto> {
        const context = await this.leadAccess.open(callToken, leadToken);
        return this.present(context, await this.canReview(context));
    }

    async save(
        callToken: string,
        leadToken: string,
        dto: CallPageLeadReviewRequestDto,
    ): Promise<CallPageLeadViewDto> {
        const context = await this.leadAccess.open(callToken, leadToken);
        if (!(await this.rate.tryConsume(leadToken))) {
            throw new HttpException(
                CALL_PAGE_LEAD_MESSAGES.tooOften,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        if (!(await this.canReview(context))) {
            throw new ForbiddenException(CALL_PAGE_LEAD_MESSAGES.forbidden);
        }
        const { call, lead } = context;
        const analysis = pickActiveAnalysis(call.records);
        const view = analysis
            ? readCallPageAnalysis(analysis.user_result as unknown)
            : null;
        if (analysis === null || view === null) {
            throw new NotFoundException(CALL_PAGE_MESSAGES.noAnalysis);
        }
        const authorName = await this.names.nameOf(call.domain, lead.u);
        await this.reviews.save({
            domain: call.domain,
            transcriptionId: call.row.id,
            managerId: normalizeUserId(call.row.userId),
            authorId: lead.u,
            review: callReviewPayloadOf(dto, {
                aiScore: analysisAiScore(view),
                analysisId: analysis.id,
                authorRole: lead.r,
                authorName: authorName ?? '',
            }),
        });
        await resetFeedbackCaches(
            this.cache,
            call.domain,
            'call_review',
            this.logger,
        );
        return this.present(context, true);
    }

    /** Право на отзыв сейчас — по структуре, не по роли из ссылки. */
    private async canReview(context: CallPageLeadContext): Promise<boolean> {
        const access = await this.access.resolve(
            context.call.domain,
            context.lead.u,
        );
        return canReviewCall(access, normalizeUserId(context.call.row.userId));
    }

    private async present(
        context: CallPageLeadContext,
        canReview: boolean,
    ): Promise<CallPageLeadViewDto> {
        const { call, lead } = context;
        const [viewerName, reviews] = await Promise.all([
            this.names.nameOf(call.domain, lead.u),
            canReview
                ? this.reviews.listForCall(call.domain, call.row.id)
                : Promise.resolve([]),
        ]);
        return presentCallPageLead({ lead, viewerName, canReview, reviews });
    }
}
