/**
 * Админ-ручки обратной связи и расхода модели (план Фазы 3, П5):
 * сводка реакций витрины за период и стоимость вызовов LLM за месяц.
 * Только чтение записей ais — ни очереди, ни Bitrix здесь нет.
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ADMIN_TAG,
} from './admin-controller.const';
import {
    AiAnalyticsCostQueryDto,
    AiAnalyticsCostResultDto,
} from '../dto/ai-analytics-cost.dto';
import {
    AiAnalyticsFeedbackQueryDto,
    AiAnalyticsFeedbackResultDto,
} from '../dto/ai-analytics-feedback.dto';
import { AiAnalyticsCostService } from '../services/ai-analytics-cost.service';
import { AiAnalyticsFeedbackSummaryService } from '../services/ai-analytics-feedback-summary.service';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsFeedbackCostAdminController {
    constructor(
        private readonly feedback: AiAnalyticsFeedbackSummaryService,
        private readonly cost: AiAnalyticsCostService,
    ) {}

    @ApiOperation({
        summary: 'Сводка обратной связи витрины за период',
        description:
            'Записи ais типа ai-analytics-feedback домена за период дат ' +
            '(границы по UTC, обе включительно): реакции витрины (view, ' +
            'useful, not_useful, disagree), факты доставки push-контура ' +
            '(alert_sent, alert_handled, digest_sent, agenda_sent) и ' +
            'слепые метки руководителя (rop_mark) — счётчиками по видам и ' +
            'по менеджерам, плюс доля полезных реакций. Записи чужой формы ' +
            'в счётчики не попадают, но показаны числом skipped, чтобы ' +
            'потеря не пряталась.',
    })
    @ApiOkResponse({
        description: 'Счётчики по видам и менеджерам, доля полезных реакций.',
        type: AiAnalyticsFeedbackResultDto,
    })
    @Get('feedback')
    async feedbackSummary(
        @Query() query: AiAnalyticsFeedbackQueryDto,
    ): Promise<AiAnalyticsFeedbackResultDto> {
        return this.feedback.summary(query.domain, query.from, query.to);
    }

    @ApiOperation({
        summary: 'Расход языковой модели по порталу за месяц',
        description:
            'Токены и стоимость вызовов LLM живут в колонках самих ' +
            'ais-записей (tokens_count и price, решение владельца B2 от ' +
            '21.09.2026), поэтому расход по всем типам снапшотов ' +
            'считается одним чтением месяца. Рядом — оценка по цене ' +
            'реестра: токены / 1000 × llm_price_per_1k. Если цена в ' +
            'реестре нулевая («не задана») или записи не несут стоимости, ' +
            'ответ помечается estimated = true — числа тогда оценка, а не ' +
            'факт биллинга.',
    })
    @ApiOkResponse({
        description: 'Вызовы, токены и стоимость — всего и по типам.',
        type: AiAnalyticsCostResultDto,
    })
    @Get('cost')
    async costSummary(
        @Query() query: AiAnalyticsCostQueryDto,
    ): Promise<AiAnalyticsCostResultDto> {
        return this.cost.summary(query.domain, query.month);
    }
}
