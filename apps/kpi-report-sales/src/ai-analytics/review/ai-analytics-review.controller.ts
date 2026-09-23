import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
    Req,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import {
    AI_REVIEW_FEEDBACK_OBJECT_PREFIX,
    AI_REVIEW_MESSAGES,
    AI_REVIEW_ROUTE,
} from '../constants/ai-review.const';
import { AiReviewRequestDto, AiReviewResponseDto } from '../dto/ai-review.dto';
import { AiAnalyticsReviewUseCase } from './ai-analytics-review.use-case';
import { AiReviewRateLimiter } from './review-rate-limit';

/**
 * Отзыв руководителя на разбор звонка с сайта продукта (страница «Что нужно
 * от руководителя»). Ручка открытая: руководитель не во фрейме Bitrix, и
 * portal-context сессии у него нет — вместо неё проверяется ссылка на
 * карточку разбора (портал, смарт, элемент) и действует лимит отправок с
 * одного адреса. Тот же тег и префикс, что у остальных ручек ai-analytics.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsReviewController {
    constructor(
        private readonly review: AiAnalyticsReviewUseCase,
        private readonly limiter: AiReviewRateLimiter,
    ) {}

    @Post(AI_REVIEW_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отзыв руководителя на разбор звонка (с сайта продукта)',
        description:
            'Принимает отзыв по ссылке на карточку разбора: из ссылки берутся ' +
            'портал, смарт-процесс и элемент; смарт сверяется с установленным ' +
            'на портале «AI-анализ звонков» (иначе 400), запись разбора ищется ' +
            'по элементу. Отзыв пишется записью обратной связи ' +
            '(ai-analytics-feedback: useful при согласии, disagree иначе, ' +
            'object site-review:{itemId}, детали в payload) и уходит в чат ' +
            'админов. Ручка открытая: без portal-context сессии, лимит ' +
            'отправок с одного адреса — 10 за 10 минут (429).',
    })
    @ApiBody({
        type: AiReviewRequestDto,
        description:
            'Ссылка на разбор, автор и роль, вердикт, пункты замечаний, ' +
            'комментарий (обязателен при частичном согласии и несогласии), ' +
            'контакт и текст протокола анкеты.',
    })
    @ApiOkResponse({
        type: AiReviewResponseDto,
        description:
            'Конверт со status = ready: id записи обратной связи, домен, ' +
            'элемент, найденные транскрипция и менеджер.',
    })
    @ApiBadRequestResponse({
        description:
            'Ссылка не на карточку разбора, смарт не найден на портале или ' +
            'ведёт не на разбор звонка, нет комментария при несогласии.',
    })
    @ApiTooManyRequestsResponse({
        description: 'Лимит отправок с одного адреса исчерпан.',
    })
    async submit(
        @Body() dto: AiReviewRequestDto,
        @Req() request: Request,
    ): Promise<AiReviewResponseDto> {
        if (!this.limiter.tryConsume(clientKeyOf(request))) {
            throw new HttpException(
                AI_REVIEW_MESSAGES.rateLimited,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        const data = await this.review.execute(dto);
        return {
            status: 'ready',
            requestKey: `${data.domain}:${AI_REVIEW_FEEDBACK_OBJECT_PREFIX}:${data.itemId}`,
            data,
        };
    }
}

/** Адрес клиента: первый из X-Forwarded-For (за прокси), иначе ip запроса. */
export function clientKeyOf(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded?.split(',')[0];
    return first?.trim() || request.ip || 'unknown';
}
