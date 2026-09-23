import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { AI_PLAN_FACT_ROUTE } from '../constants/ai-plan-fact.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import {
    AiPlanFactRequestDto,
    AiPlanFactResponseDto,
} from '../dto/ai-plan-fact.dto';
import { PlanFactUseCase } from './plan-fact.use-case';

/**
 * Реконсиляция «план — факт» за месяц (план Фазы 3, поток П2): цели
 * руководителя из снимка планов против факта месяца — темп по рабочим
 * дням, описательный прогноз закрытия под потолком дня, разрыв и
 * «сколько надо в день».
 *
 * Ручка читающая: мутаций нет, поэтому guard мутаций не нужен, а права
 * проверяются периметром `RequesterAccessService.resolveViewer` —
 * руководитель видит свой периметр, менеджер только себя и только при
 * `ai_analytics_self_view_enabled`, иначе 403.
 *
 * Денежного плана здесь нет (решение владельца В6 от 22.09.2026):
 * источник плана — исключительно снимок целей руководителя.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsPlanFactController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly planFact: PlanFactUseCase,
    ) {}

    @Post(AI_PLAN_FACT_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Реконсиляция план-факт за месяц',
        description:
            'По каждому менеджеру периметра и по отделу целиком: план ' +
            'месяца из снимка целей руководителя, факт на дату из ' +
            'месячных снапшотов, темп относительно прошедшей доли ' +
            'месяца по рабочим дням календаря портала, описательный ' +
            'прогноз закрытия при текущем темпе (срезан потолком ' +
            'plan_day_ceiling), разрыв и «сколько надо в день». ' +
            'Синхронно: всё уже лежит в снапшотах, Битрикс не ' +
            'опрашивается; закрытый месяц читается из кэша. Плана нет — ' +
            'строка no-plan без единого числа, причина в reasons. ' +
            'Признак «План дня» выключен — perDayNeeded = null с ' +
            'причиной, остальные числа на месте, а не 403.',
    })
    @ApiBody({ type: AiPlanFactRequestDto })
    @ApiOkResponse({
        type: AiPlanFactResponseDto,
        description: 'Реконсиляция за месяц; status всегда ready.',
    })
    async getPlanFact(
        @Body() dto: AiPlanFactRequestDto,
    ): Promise<AiPlanFactResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );

        return this.planFact.execute(dto, access);
    }
}
