import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from './constants/ai-analytics.const';
import { AI_DAILY_PLAN_ROUTE } from './constants/ai-plan.const';
import { RequesterAccessService } from './domain/access/requester-access.service';
import { DailyPlanUseCase } from './domain/use-cases/daily-plan.use-case';
import {
    AiDailyPlanRequestDto,
    AiDailyPlanResponseDto,
} from './dto/ai-daily-plan.dto';

/**
 * AI-аналитика отдела продаж, Фаза 2 (план §4.9 и §5.2, поток 17):
 * план дня менеджера. Третий контроллер вкладки — тег и префикс те же,
 * что у `AiAnalyticsController` (Фаза 1a) и `AiAnalyticsOverviewController`
 * (Фаза 1b), разнесены по файлам ради правила «класс ≤ 300 строк».
 *
 * Ручка синхронная: очередь и WS не нужны — всё считается по уже
 * записанным снапшотам, Битрикс не вызывается.
 *
 * Права: периметр requester'а даёт `resolveViewer` (менеджер без headOf
 * при выключенной `ai_analytics_self_view_enabled` получает 403); чужой
 * `managerId` — 403; при `ai_analytics_daily_plan_enabled = false` —
 * 403 с текстом о выключенной настройке (решение владельца, §9 п. 4).
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsPlanController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly dailyPlan: DailyPlanUseCase,
    ) {}

    @Post(AI_DAILY_PLAN_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'План дня менеджера от цели месяца',
        description:
            'Обратная задача: цель месяца G минус закрытые продажи Y₀ и ' +
            'ожидание от открытого пайплайна λ_pipe даёт требуемый объём ' +
            'входной активности N_req, он разворачивается по рёбрам воронки ' +
            '(N_k = N_{k+1}/E[θ]) и делится на оставшиеся рабочие дни с ' +
            'потолком дня plan_day_ceiling — догонять месячный недобор за ' +
            'три дня не план, а демотивация. Считается синхронно по ' +
            'снапшотам ai-analytics-forecast, ai-analytics-portal-model и ' +
            'ai-analytics-manager-month; Битрикс не вызывается. Кэш на ' +
            '180 с по паре день + менеджер, сбрасывается при сохранении ' +
            'настроек. Без истории стадий pipelineExpected = null, и цель ' +
            'на пайплайн НЕ уменьшается. Нет модели портала или прогноза — ' +
            'штатная деградация: план по объёму и код причины в reason. ' +
            'Руководителю дополнительно отдаётся блок ropOnly (нормы, ' +
            'режим betaSource, два G′ и связующее ограничение).',
    })
    @ApiBody({ type: AiDailyPlanRequestDto })
    @ApiOkResponse({
        type: AiDailyPlanResponseDto,
        description:
            'Конверт со status = ready: в data — план дня с объяснением ' +
            '(шаги G → Y₀ → λ_pipe → N_req → разворот → потолок).',
    })
    async getDailyPlan(
        @Body() dto: AiDailyPlanRequestDto,
    ): Promise<AiDailyPlanResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );

        return this.dailyPlan.execute(dto, access);
    }
}
