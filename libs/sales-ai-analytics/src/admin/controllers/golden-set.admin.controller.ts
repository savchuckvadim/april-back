/**
 * Админ-ручки золотого набора test-retest (план Фазы 3, П5 ↔ П7):
 * состав отчётов согласия оценщика и запуск повторного прогона.
 *
 * Запуск ставит джобу `CALL_REPORT_RETEST` в очередь `CALL_REPORT` —
 * воркер в `apps/event-sales` повторяет выборку тем же разбором и пишет
 * отчёт согласия (Фаза 3, П7). Без очереди в сборке — честный отказ.
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
        summary: 'Запустить повторный прогон test-retest',
        description:
            'Ставит джобу CALL_REPORT_RETEST (очередь CALL_REPORT, воркер ' +
            'apps/event-sales): разборы текущей версии промпта за 90 дней ' +
            '(не больше квоты) повторяются тем же фокус-разбором, пары ' +
            'сводятся в отчёт согласия ai-analytics-golden-report — по ' +
            'одной актуальной записи на версию. Один запуск на домен в ' +
            'сутки (jobId по дате); бюджет времени прогона 45 минут. Без ' +
            'очереди в сборке ответ честный: dispatched = false с причиной, ' +
            'ошибка не бросается.',
    })
    @ApiBody({ type: AiAnalyticsGoldenSetRunDto })
    @ApiOkResponse({
        description: 'Джоба поставлена либо отказ с причиной.',
        type: AiAnalyticsGoldenSetRunResultDto,
    })
    @Post('golden-set/run')
    async run(
        @Body() dto: AiAnalyticsGoldenSetRunDto,
    ): Promise<AiAnalyticsGoldenSetRunResultDto> {
        return this.goldenSet.run({
            domain: dto.domain,
            ...(dto.quota === undefined ? {} : { quota: dto.quota }),
        });
    }
}
