/**
 * Админ-ручки переразбора истории текущей версией промпта (этап 1B плана
 * 2026-10-19-ai-focus-plan): запуск (джоба `CALL_REPORT_REANALYZE` в
 * очереди `CALL_REPORT`, воркер — `apps/event-sales`) и статус прогона
 * с отчётом согласия старой и новой версии. Карточки разборов в Битриксе
 * не трогаются, уведомления не шлются.
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
    AiAnalyticsReanalyzeRunDto,
    AiAnalyticsReanalyzeRunResultDto,
} from '../dto/ai-analytics-reanalyze.dto';
import {
    AiAnalyticsReanalyzeStatusDto,
    AiAnalyticsReanalyzeStatusQueryDto,
} from '../dto/ai-analytics-reanalyze-status.dto';
import { AiAnalyticsReanalyzeService } from '../services/ai-analytics-reanalyze.service';

/** Пути ручек переразбора (один источник для контроллера и спек). */
export const AI_ANALYTICS_REANALYZE_ROUTES = {
    run: 'reanalyze',
    status: 'reanalyze-status',
} as const;

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsReanalyzeAdminController {
    constructor(private readonly reanalyze: AiAnalyticsReanalyzeService) {}

    @ApiOperation({
        summary: 'Запустить переразбор истории текущей версией промпта',
        description:
            'Ставит джобу CALL_REPORT_REANALYZE (очередь CALL_REPORT, воркер ' +
            'apps/event-sales). Кандидаты — готовые транскрипции периода ' +
            'сотрудников списка (по умолчанию пилот из настроек портала), у ' +
            'которых активный разбор другой серии промпта или без версий; ' +
            'разбор текущей серии и звонки без разбора пропускаются, повтор ' +
            'запуска безопасен. Новая запись agent-analysis копирует ссылки ' +
            'старой (карточка смарта, дело, сущность, владелец), старая ' +
            'помечается superseded; Битрикс не вызывается, алерты не шлются. ' +
            'Квота на часть и бюджет 45 минут: остаток джоба дорабатывает ' +
            'продолжениями сама. dryRun — без модели: кандидаты и оценка ' +
            'стоимости в запись статуса (тоже через джобу). Без очереди в ' +
            'сборке — dispatched: false с причиной.',
    })
    @ApiBody({ type: AiAnalyticsReanalyzeRunDto })
    @ApiOkResponse({
        description: 'Джоба поставлена либо отказ с причиной.',
        type: AiAnalyticsReanalyzeRunResultDto,
    })
    @Post(AI_ANALYTICS_REANALYZE_ROUTES.run)
    async run(
        @Body() dto: AiAnalyticsReanalyzeRunDto,
    ): Promise<AiAnalyticsReanalyzeRunResultDto> {
        return this.reanalyze.run({
            domain: dto.domain,
            from: dto.from,
            to: dto.to,
            ...(dto.userIds === undefined ? {} : { userIds: dto.userIds }),
            ...(dto.quota === undefined ? {} : { quota: dto.quota }),
            ...(dto.dryRun === undefined ? {} : { dryRun: dto.dryRun }),
            ...(dto.timeZone === undefined ? {} : { timeZone: dto.timeZone }),
        });
    }

    @ApiOperation({
        summary: 'Статус переразбора периода и отчёт согласия версий',
        description:
            'Запись статуса call-report-reanalysis-run по домену и периоду ' +
            '(кандидаты, сделано, сбои, пропуски по причинам, токены и ' +
            'стоимость, finished, оценка dryRun) и активные отчёты ' +
            'ai-analytics-version-agreement портала: по каждой старой серии — ' +
            'пары, ICC/σ, средний сдвиг общего балла и оценок разделов в ' +
            'разбивке по старой версии промпта. По ним владелец решает, ' +
            'объявлять ли старые серии совместимыми на других порталах.',
    })
    @ApiOkResponse({
        description: 'Статус прогона (null — не было) и отчёты согласия.',
        type: AiAnalyticsReanalyzeStatusDto,
    })
    @Get(AI_ANALYTICS_REANALYZE_ROUTES.status)
    async status(
        @Query() query: AiAnalyticsReanalyzeStatusQueryDto,
    ): Promise<AiAnalyticsReanalyzeStatusDto> {
        return this.reanalyze.status(query.domain, query.from, query.to);
    }
}
