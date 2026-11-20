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
import { DealMovementAccessService } from './deal-movement-access.service';
import { DealMovementDealsUseCase } from './deal-movement-deals.use-case';
import { DealMovementOverviewUseCase } from './deal-movement-overview.use-case';
import {
    DEAL_MOVEMENT_DEALS_ROUTE,
    DEAL_MOVEMENT_MAX_DAYS,
    DEAL_MOVEMENT_OVERVIEW_ROUTE,
    DEAL_MOVEMENT_TEXTS,
} from './deal-movement-vitrina.const';
import { DealMovementDealsResponseDto } from './dto/deal-movement-deals.dto';
import { DealMovementOverviewResponseDto } from './dto/deal-movement-overview.dto';
import {
    DealMovementDealsRequestDto,
    DealMovementOverviewRequestDto,
} from './dto/deal-movement-request.dto';

/**
 * Раздел «Движение сделок» витрины AI отчёта KPI (постановка
 * ai/tasks/ai-polyansky-method/2026-11-10-deal-movement.md, §7). Под
 * сессией портала; руководителям и суперпользователю — их периметр,
 * менеджеру — только свои данные при включённом самопросмотре, иначе 403.
 * Данные — ночные снимки движения сделок и разборы звонков из БД: живых
 * запросов в Битрикс нет, ответы синхронные.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class DealMovementVitrinaController {
    constructor(
        private readonly access: DealMovementAccessService,
        private readonly overview: DealMovementOverviewUseCase,
        private readonly deals: DealMovementDealsUseCase,
    ) {}

    @PortalSessionProtected()
    @Post(DEAL_MOVEMENT_OVERVIEW_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Движение сделок: обзор за период',
        description:
            'Статусы открытых сделок «ОП Основная» (Движется, Без ' +
            'продвижения, Без внимания, Вернулась назад, Под риском) по ' +
            'отделу и менеджерам на последнюю ночь периода и по ночам — ' +
            'сколько сделок и на какую сумму; матрица «оценка звонка × ' +
            'продвижение сделки» по разобранным звонкам периода с пометкой ' +
            '«клиент купил бы и без менеджера»; честность оценок — доля ' +
            'звонков с продвижением 4–5, после которых стадия не сдвинулась ' +
            `вперёд за N дней. Период — до ${DEAL_MOVEMENT_MAX_DAYS} дней. ` +
            'Где звонков мало — число и пометка «мало звонков».',
    })
    @ApiBody({
        type: DealMovementOverviewRequestDto,
        description: 'Период и при желании — выбранные менеджеры.',
    })
    @ApiOkResponse({
        type: DealMovementOverviewResponseDto,
        description: 'Конверт со status = ready: обзор в data.',
    })
    @ApiForbiddenResponse({
        description: `${DEAL_MOVEMENT_TEXTS.leadersOnly}.`,
    })
    async getOverview(
        @Body() dto: DealMovementOverviewRequestDto,
    ): Promise<DealMovementOverviewResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        return this.overview.execute(dto, access);
    }

    @PortalSessionProtected()
    @Post(DEAL_MOVEMENT_DEALS_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Движение сделок: проблемные сделки',
        description:
            'Проблемные сделки последней ночи по ответственному: Без ' +
            'продвижения, Без внимания, Вернулась назад, Под риском — по ' +
            'убыванию суммы: название и ссылка, сумма, стадия, дней в ' +
            'стадии, срок стадии, причина словами, с какой ночи в статусе. ' +
            'На ответственного и статус в списке не больше 30 самых крупных ' +
            '(сколько всего — в groups). Отбор и страница — на сервере.',
    })
    @ApiBody({
        type: DealMovementDealsRequestDto,
        description: 'Менеджеры, статусы и страница.',
    })
    @ApiOkResponse({
        type: DealMovementDealsResponseDto,
        description: 'Конверт со status = ready: страница в data.',
    })
    @ApiForbiddenResponse({
        description: `${DEAL_MOVEMENT_TEXTS.leadersOnly}.`,
    })
    async getDeals(
        @Body() dto: DealMovementDealsRequestDto,
    ): Promise<DealMovementDealsResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        return this.deals.execute(dto, access);
    }
}
