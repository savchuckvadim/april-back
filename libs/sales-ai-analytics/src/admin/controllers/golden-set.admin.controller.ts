/**
 * Админ-ручки золотого набора test-retest (план Фазы 3, П5 ↔ П7):
 * состав отчётов согласия оценщика и запуск повторного прогона.
 *
 * Запуск пока отвечает отказом с объяснением: отбор выборки и повторный
 * разбор живут в `apps/event-sales`, и своего значения `JobNames` у них
 * ещё нет — ставить в очередь нечего. Подключается потоком П7.
 */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
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
    AiAnalyticsGoldenSetQueryDto,
    AiAnalyticsGoldenSetResultDto,
    AiAnalyticsGoldenSetRunDto,
    AiAnalyticsGoldenSetRunResultDto,
} from '../dto/ai-analytics-golden-set.dto';
import { AiAnalyticsGoldenSetService } from '../services/ai-analytics-golden-set.service';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsGoldenSetAdminController {
    constructor(private readonly goldenSet: AiAnalyticsGoldenSetService) {}

    @ApiOperation({
        summary: 'Состав золотого набора: отчёты согласия оценщика',
        description:
            'Снапшоты ai-analytics-golden-report портала (по одному на ' +
            'версию промпта, хранятся бессрочно): версия, число пар ' +
            'разборов, квота retest_budget_calls и уложилась ли выборка, ' +
            'σ_llm к применению и её источник (measured — измерена на ' +
            'парах, configured — дефолт реестра). Свежие первыми. Флаг ' +
            'runAvailable показывает, подключён ли запуск прогона.',
    })
    @ApiOkResponse({
        description: 'Отчёты согласия портала и состояние запуска.',
        type: AiAnalyticsGoldenSetResultDto,
    })
    @Get('golden-set')
    async list(
        @Query() query: AiAnalyticsGoldenSetQueryDto,
    ): Promise<AiAnalyticsGoldenSetResultDto> {
        return this.goldenSet.list(query.domain);
    }

    @ApiOperation({
        summary: 'Запустить повторный прогон test-retest (пока не подключён)',
        description:
            'Ручка-заглушка на время Фазы 3: отбор выборки и повторный ' +
            'разбор той же версией промпта живут в контуре разбора ' +
            'apps/event-sales, и отдельного значения JobNames у них ещё ' +
            'нет — ставить в очередь нечего. Ответ честный: dispatched = ' +
            'false, jobId = null и причина «прогон подключается потоком ' +
            'П7». Ошибку ручка не бросает, чтобы UI админки показал ' +
            'состояние, а не красный экран.',
    })
    @ApiBody({ type: AiAnalyticsGoldenSetRunDto })
    @ApiOkResponse({
        description: 'Отказ с объяснением: джоба не поставлена.',
        type: AiAnalyticsGoldenSetRunResultDto,
    })
    @Post('golden-set/run')
    run(
        @Body() dto: AiAnalyticsGoldenSetRunDto,
    ): AiAnalyticsGoldenSetRunResultDto {
        return this.goldenSet.run(dto.domain);
    }
}
