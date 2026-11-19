import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { CALLS_LIST_MAX_DAYS, CALLS_LIST_ROUTE } from './calls-list.const';
import { CallsListUseCase } from './calls-list.use-case';
import { CallsListRequestDto } from './dto/calls-list-request.dto';
import { CallsListResponseDto } from './dto/calls-list.dto';

/**
 * Раздел «Разборы звонков» отчёта KPI: список разборов за период для
 * руководителей. Под сессией портала; строки — только менеджеров из
 * периметра пользователя.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class CallsListController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly list: CallsListUseCase,
    ) {}

    @PortalSessionProtected()
    @Post(CALLS_LIST_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Список разборов звонков за период',
        description:
            'Страница списка разборов звонков: дата, менеджер, тип звонка, ' +
            'оценка AI, клиент, сводка отзывов руководителей (сколько, ' +
            'сколько не согласны, средняя оценка, мой отзыв) и личная ссылка ' +
            'на страницу разбора с правом оставить отзыв (7 дней). Фильтры: ' +
            `период (не длиннее ${CALLS_LIST_MAX_DAYS} дней), менеджеры, ` +
            'типы звонка, оценка AI от–до, отзывы; порядок — по дате или ' +
            'оценке. Отбор и страница — на сервере, в ответе страница, общее ' +
            'число строк и варианты фильтров за период. Только руководителям ' +
            'и суперпользователю; строки — менеджеров из периметра.',
    })
    @ApiBody({
        type: CallsListRequestDto,
        description: 'Период, фильтры, порядок и страница.',
    })
    @ApiOkResponse({
        type: CallsListResponseDto,
        description: 'Страница списка разборов.',
    })
    @ApiForbiddenResponse({
        description: 'Раздел доступен руководителям.',
    })
    async getList(
        @Body() dto: CallsListRequestDto,
    ): Promise<CallsListResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        return this.list.execute(dto, access);
    }
}
