import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiForbiddenResponse,
    ApiGoneResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import {
    CALL_PAGE_LEAD_MESSAGES,
    CALL_PAGE_LEAD_REVIEW_ROUTE,
    CALL_PAGE_LEAD_ROUTE,
} from './call-page-lead.const';
import { CallPageLeadUseCase } from './call-page-lead.use-case';
import {
    CallPageLeadReviewRequestDto,
    CallPageLeadViewDto,
} from './dto/call-page-lead.dto';

const TOKEN_PARAM = {
    name: 'token',
    description:
        'Ссылка-пропуск звонка: часть адреса /call/{token}/lead/{lead}.',
    example: '1g9gd-3q2x8Yk0mXo1p7cT5vB9nW4sZ6aQeR',
} as const;

const LEAD_PARAM = {
    name: 'lead',
    description:
        'Личный ключ руководителя к этому звонку (выдаётся в разделе ' +
        '«Разборы звонков» отчёта KPI, действует 7 дней).',
    example: 'eyJ2IjoxLCJkIjoiZ3NyLmJpdHJpeDI0LnJ1In0.Qm9vZ3VzU2lnbmF0dXJl',
} as const;

/**
 * Личная страница разбора руководителя на сайте «Отчёта». Ручки открытые,
 * без сессии портала: доступ — по паре «ссылка звонка + личный ключ», право
 * на отзыв сервер перепроверяет по структуре отделов каждый раз. Вызывает
 * сервер сайта (Next) — адрес бэкенда браузеру не виден.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class CallPageLeadController {
    constructor(private readonly lead: CallPageLeadUseCase) {}

    @Get(CALL_PAGE_LEAD_ROUTE)
    @ApiOperation({
        summary: 'Отзывы руководителей по звонку (личная ссылка)',
        description:
            'Кто открыл страницу (имя, роль, можно ли оставить отзыв, до ' +
            'какого момента действует ссылка), свой актуальный отзыв и ' +
            'отзывы других руководителей по звонку. Если права на отзыв ' +
            'сейчас нет (не руководитель этого сотрудника) — отзывы не ' +
            'отдаются. Менеджеру отзывы не показываются нигде.',
    })
    @ApiParam(TOKEN_PARAM)
    @ApiParam(LEAD_PARAM)
    @ApiOkResponse({
        type: CallPageLeadViewDto,
        description: 'Данные блока «Оценка руководителя».',
    })
    @ApiNotFoundResponse({ description: CALL_PAGE_LEAD_MESSAGES.invalid })
    @ApiGoneResponse({ description: CALL_PAGE_LEAD_MESSAGES.expired })
    async getLead(
        @Param('token') token: string,
        @Param('lead') lead: string,
    ): Promise<CallPageLeadViewDto> {
        return this.lead.view(token, lead);
    }

    @Post(CALL_PAGE_LEAD_REVIEW_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить свой отзыв о разборе',
        description:
            'Отзыв руководителя: согласен ли с оценкой AI, своя оценка 1–10, ' +
            'замечания «не так» к пунктам разбора и общий комментарий. Один ' +
            'актуальный отзыв на руководителя и звонок — новый заменяет ' +
            'прежний. Право проверяется при каждом сохранении: руководитель ' +
            'этого сотрудника или суперпользователь. Не чаще 10 сохранений ' +
            'в минуту по одной ссылке. В ответе — обновлённый блок отзывов.',
    })
    @ApiParam(TOKEN_PARAM)
    @ApiParam(LEAD_PARAM)
    @ApiBody({
        type: CallPageLeadReviewRequestDto,
        description: 'Отзыв руководителя.',
    })
    @ApiOkResponse({
        type: CallPageLeadViewDto,
        description: 'Отзыв сохранён; блок отзывов после сохранения.',
    })
    @ApiForbiddenResponse({ description: CALL_PAGE_LEAD_MESSAGES.forbidden })
    @ApiNotFoundResponse({
        description: `${CALL_PAGE_LEAD_MESSAGES.invalid}, либо по звонку ещё нет разбора.`,
    })
    @ApiGoneResponse({ description: CALL_PAGE_LEAD_MESSAGES.expired })
    @ApiTooManyRequestsResponse({
        description: CALL_PAGE_LEAD_MESSAGES.tooOften,
    })
    async saveReview(
        @Param('token') token: string,
        @Param('lead') lead: string,
        @Body() dto: CallPageLeadReviewRequestDto,
    ): Promise<CallPageLeadViewDto> {
        return this.lead.save(token, lead, dto);
    }
}
