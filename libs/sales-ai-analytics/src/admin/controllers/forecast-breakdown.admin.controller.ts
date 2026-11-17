/**
 * Админ-ручка разложения прогноза отдела (Фаза 4, п. 4.1): только чтение
 * сохранённых снапшотов `ais` по домену, без очереди и Bitrix.
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
import { AiForecastBreakdownResultDto } from '../dto/ai-analytics-forecast-breakdown.dto';
import { AiAnalyticsPhase4QueryDto } from '../dto/ai-analytics-phase4-query.dto';
import { AiAnalyticsForecastBreakdownService } from '../services/ai-analytics-forecast-breakdown.service';

/** Маршрут под `admin/ai-analytics`. */
export const AI_ANALYTICS_FORECAST_BREAKDOWN_ROUTE = 'forecast-breakdown';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsForecastBreakdownAdminController {
    constructor(
        private readonly breakdown: AiAnalyticsForecastBreakdownService,
    ) {}

    @ApiOperation({
        summary: 'Разложение прогноза отдела на слагаемые',
        description:
            'Из чего сложилась середина прогноза: закрытые продажи, ожидание ' +
            'от проведённых и от новых презентаций (открытые сделки — ' +
            'справочно, вне суммы; у дней до 18.11.2026 — сделки и новые ' +
            'встречи по звонкам) — по отделу ' +
            '(последний день журнала ai-analytics-forecast-log) и по каждому ' +
            'менеджеру за тот же день (ai-analytics-forecast), с входами ' +
            'расчёта и сделками с наибольшим вкладом. Нужна, чтобы найти ' +
            'источник завышенного прогноза: брошенные открытые сделки, ' +
            'завышенный темп или конверсия. Только сохранённые числа ночного ' +
            'расчёта; слагаемые появляются с ночи после выкладки 16.11.2026, ' +
            'у более ранних дней они null.',
    })
    @ApiOkResponse({ type: AiForecastBreakdownResultDto })
    @Get(AI_ANALYTICS_FORECAST_BREAKDOWN_ROUTE)
    async forecastBreakdown(
        @Query() query: AiAnalyticsPhase4QueryDto,
    ): Promise<AiForecastBreakdownResultDto> {
        return this.breakdown.breakdown(query.domain);
    }
}
