/**
 * Админ-ручки Фазы 4 (волна B, поток B3): пул порталов, связь качества с
 * исходом, проверка точности прогноза отдела и эффект советов — только
 * чтение снапшотов `ais` по домену, без очереди и Bitrix. Домены других
 * порталов пула не раскрываются: только обезличенные ключи и число.
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
import { AiAnalyticsForecastBacktestResultDto } from '../dto/ai-analytics-phase4-backtest.dto';
import { AiAnalyticsRecommendationEffectResultDto } from '../dto/ai-analytics-phase4-effect.dto';
import { AiAnalyticsPoolStatusResultDto } from '../dto/ai-analytics-phase4-pool.dto';
import { AiAnalyticsQualityLinkResultDto } from '../dto/ai-analytics-phase4-quality.dto';
import {
    AI_ANALYTICS_BACKTEST_HISTORY,
    AiAnalyticsForecastBacktestQueryDto,
    AiAnalyticsPhase4QueryDto,
} from '../dto/ai-analytics-phase4-query.dto';
import { AiAnalyticsPhase4StatusService } from '../services/ai-analytics-phase4-status.service';

/** Маршруты ручек Фазы 4 под `admin/ai-analytics`. */
export const AI_ANALYTICS_PHASE4_ADMIN_ROUTES = {
    poolStatus: 'pool-status',
    forecastBacktest: 'forecast-backtest',
    recommendationEffect: 'recommendation-effect',
    qualityLink: 'quality-link',
} as const;

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsPhase4AdminController {
    constructor(private readonly phase4: AiAnalyticsPhase4StatusService) {}

    @ApiOperation({
        summary: 'Состояние пула порталов для портала',
        description:
            'Последний снапшот ai-analytics-pool домена (месячный шаг ' +
            'конвейера, копия у каждого участника): статус и причины, ' +
            'число порталов с согласием и вошедших в пул, вердикты по ' +
            'порталам обезличенными ключами (доменов нет), свой ключ, ' +
            'β пула с неоднородностью I² и готовность к уровню E2. ' +
            'latest = null — пул не собирался или у портала нет согласия.',
    })
    @ApiOkResponse({ type: AiAnalyticsPoolStatusResultDto })
    @Get(AI_ANALYTICS_PHASE4_ADMIN_ROUTES.poolStatus)
    async poolStatus(
        @Query() query: AiAnalyticsPhase4QueryDto,
    ): Promise<AiAnalyticsPoolStatusResultDto> {
        return this.phase4.poolStatus(query.domain);
    }

    @ApiOperation({
        summary: 'Проверки точности прогноза отдела по закрытым месяцам',
        description:
            'Последние months (по умолчанию 6) снапшотов ' +
            'ai-analytics-forecast-backtest домена, свежие первыми: статус ' +
            'гейта L4 и причины, теневые месяцы и порог, покрытие вилки с ' +
            'интервалом Уилсона, отношение ошибок к простым прогнозам с ' +
            'бутстрап-интервалом, pinball. Замещённые записи не отдаются.',
    })
    @ApiOkResponse({ type: AiAnalyticsForecastBacktestResultDto })
    @Get(AI_ANALYTICS_PHASE4_ADMIN_ROUTES.forecastBacktest)
    async forecastBacktest(
        @Query() query: AiAnalyticsForecastBacktestQueryDto,
    ): Promise<AiAnalyticsForecastBacktestResultDto> {
        return this.phase4.forecastBacktest(
            query.domain,
            query.months ?? AI_ANALYTICS_BACKTEST_HISTORY.months,
        );
    }

    @ApiOperation({
        summary: 'Эффект советов (гейт ступени «рекомендации»)',
        description:
            'Последний снапшот ai-analytics-recommendation-effect домена: ' +
            'выдано / выполнено / несогласий с долями и интервалами ' +
            'Уилсона, «до/после» по шагам воронки с интервалом Ньюкомба ' +
            '(единица — окно «менеджер × месяц выдачи»), свод по рычагам, ' +
            'гейт L5 с причинами и флаги подгонки показателей.',
    })
    @ApiOkResponse({ type: AiAnalyticsRecommendationEffectResultDto })
    @Get(AI_ANALYTICS_PHASE4_ADMIN_ROUTES.recommendationEffect)
    async recommendationEffect(
        @Query() query: AiAnalyticsPhase4QueryDto,
    ): Promise<AiAnalyticsRecommendationEffectResultDto> {
        return this.phase4.recommendationEffect(query.domain);
    }

    @ApiOperation({
        summary: 'Связь качества разговора с ближним исходом (β)',
        description:
            'Последний снапшот ai-analytics-quality-link домена: статус ' +
            'и причины, выборка, β внутри менеджера / между менеджерами / ' +
            'общая с интервалами, надёжность оценки, наклон калибровки, ' +
            'плацебо и гейт публикации (серия пересчётов подряд).',
    })
    @ApiOkResponse({ type: AiAnalyticsQualityLinkResultDto })
    @Get(AI_ANALYTICS_PHASE4_ADMIN_ROUTES.qualityLink)
    async qualityLink(
        @Query() query: AiAnalyticsPhase4QueryDto,
    ): Promise<AiAnalyticsQualityLinkResultDto> {
        return this.phase4.qualityLink(query.domain);
    }
}
