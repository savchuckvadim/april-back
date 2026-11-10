/**
 * Админ-ручки догона фактов v3.1 в старых разборах (этап B4): запуск
 * (джоба `CALL_REPORT_FACTS_CATCHUP` в очереди `CALL_REPORT`, воркер —
 * `apps/event-sales`) и статус прогона. Оценки разборов и карточки в
 * Битриксе не трогаются, уведомления не шлются.
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
    AiAnalyticsFactsCatchupRunDto,
    AiAnalyticsFactsCatchupRunResultDto,
} from '../dto/ai-analytics-facts-catchup.dto';
import {
    AiAnalyticsFactsCatchupStatusDto,
    AiAnalyticsFactsCatchupStatusQueryDto,
} from '../dto/ai-analytics-facts-catchup-status.dto';
import { AiAnalyticsFactsCatchupService } from '../services/ai-analytics-facts-catchup.service';

/** Пути ручек догона (один источник для контроллера и спек). */
export const AI_ANALYTICS_FACTS_CATCHUP_ROUTES = {
    run: 'facts-catchup',
    status: 'facts-catchup-status',
} as const;

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsFactsCatchupAdminController {
    constructor(private readonly catchup: AiAnalyticsFactsCatchupService) {}

    @ApiOperation({
        summary: 'Догнать факты v3.1 в старых разборах за период',
        description:
            'Ставит джобу CALL_REPORT_FACTS_CATCHUP (очередь CALL_REPORT, ' +
            'воркер apps/event-sales). Кандидаты — готовые транскрипции ' +
            'периода, у которых в активном разборе нет фактов для отчётов ' +
            '(исход, вид шага, темы возражений, сбои, цены, допродажа, ' +
            'самопредставление). По каждому — один короткий вызов модели по ' +
            'сохранённой расшифровке; факты дописываются в ту же запись ' +
            'разбора, оценки разделов и версия промпта не меняются, расход ' +
            'ложится отдельной записью agent-analysis-facts. Битрикс не ' +
            'вызывается. Квота на часть и бюджет 45 минут: остаток джоба ' +
            'дорабатывает продолжениями сама; повтор запуска безопасен. ' +
            'dryRun — подсчёт без модели: кандидаты и оценка стоимости в ' +
            'запись статуса. Без очереди в сборке — dispatched: false.',
    })
    @ApiBody({ type: AiAnalyticsFactsCatchupRunDto })
    @ApiOkResponse({
        description: 'Джоба поставлена либо отказ с причиной.',
        type: AiAnalyticsFactsCatchupRunResultDto,
    })
    @Post(AI_ANALYTICS_FACTS_CATCHUP_ROUTES.run)
    async run(
        @Body() dto: AiAnalyticsFactsCatchupRunDto,
    ): Promise<AiAnalyticsFactsCatchupRunResultDto> {
        return this.catchup.run({
            domain: dto.domain,
            from: dto.from,
            to: dto.to,
            ...(dto.quota === undefined ? {} : { quota: dto.quota }),
            ...(dto.dryRun === undefined ? {} : { dryRun: dto.dryRun }),
            ...(dto.timeZone === undefined ? {} : { timeZone: dto.timeZone }),
        });
    }

    @ApiOperation({
        summary: 'Статус догона фактов за период',
        description:
            'Запись статуса call-report-facts-catchup-run по домену и периоду: ' +
            'кандидаты, догнано, сбои, пропуски по причинам, токены и ' +
            'стоимость, finished, оценка подсчёта, «догнано N из M, осталось ' +
            '≈ X минут». null — прогона по периоду не было.',
    })
    @ApiOkResponse({
        description: 'Статус прогона (null — не было).',
        type: AiAnalyticsFactsCatchupStatusDto,
    })
    @Get(AI_ANALYTICS_FACTS_CATCHUP_ROUTES.status)
    async status(
        @Query() query: AiAnalyticsFactsCatchupStatusQueryDto,
    ): Promise<AiAnalyticsFactsCatchupStatusDto> {
        return this.catchup.status(query.domain, query.from, query.to);
    }
}
