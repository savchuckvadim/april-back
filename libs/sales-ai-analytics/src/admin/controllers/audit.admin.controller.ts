import {
    Body,
    Controller,
    Get,
    NotFoundException,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Role, Roles, RolesGuard } from '@lib/auth';
import {
    AI_ANALYTICS_AUDIT_ABOUT,
    renderAuditAboutSummary,
} from '../../audit/ai-analytics-audit.about';
import { AiAnalyticsAuditService } from '../ai-analytics-audit.service';
import {
    AiAnalyticsAuditAboutQueryDto,
    AiAnalyticsAuditAboutResponseDto,
} from '../dto/ai-analytics-audit-about.dto';
import { AiAnalyticsAuditLatestQueryDto } from '../dto/ai-analytics-audit-latest-query.dto';
import { AiAnalyticsAuditResultDto } from '../dto/ai-analytics-audit-result.dto';
import {
    AI_ANALYTICS_AUDIT_RUN_DEFAULTS,
    AiAnalyticsAuditRunDto,
} from '../dto/ai-analytics-audit-run.dto';
import {
    AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS,
    AiAnalyticsStageHistoryProbeQueryDto,
    AiAnalyticsStageHistoryProbeResponseDto,
} from '../dto/ai-analytics-stage-history-probe.dto';
import { StageHistoryProbeService } from '../stage-history-probe.service';

const FORBIDDEN_DESCRIPTION =
    'На портале выключен признак ai_analytics_audit_enabled («Аудит и ' +
    'калибровка данных AI-аналитики разрешены») — включите его в ' +
    'настройках приложения kpi-sales портала';

/**
 * Аудит данных AI-аналитики ОП по живой БД (Фаза 0 плана) — только
 * SUPER_USER и только для порталов с признаком ai_analytics_audit_enabled:
 * запуск с записью снапшота в ais, чтение последнего снапшота (тот же,
 * что пишет месячный крон kpi-report-sales) и самоописание для UI.
 * Плюс проба истории стадий сделок портала (crm.stagehistory.list) —
 * ответ на вопрос владельцу A6, признаком аудита не ограничена.
 */
@ApiTags('Sales AI Analytics Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_USER)
@Controller('admin/ai-analytics')
export class AiAnalyticsAuditAdminController {
    constructor(
        private readonly audit: AiAnalyticsAuditService,
        private readonly stageHistoryProbe: StageHistoryProbeService,
    ) {}

    @ApiOperation({
        summary: 'Запустить аудит данных AI-аналитики по живой БД',
        description:
            renderAuditAboutSummary() +
            '\n\nРучка синхронна (на больших порталах — секунды): читает ' +
            'transcriptions/ais домена за последние months календарных ' +
            'месяцев (текущий включительно), собирает отчёт и при save = true ' +
            'пишет снапшот в ais (type = ai-analytics-audit, source = admin). ' +
            'Ответ содержит markdown (разделы 1–8), структурированный report ' +
            'и самоописание about — тот же текст, что и здесь.',
    })
    @ApiBody({ type: AiAnalyticsAuditRunDto })
    @ApiOkResponse({
        description:
            'Свежий отчёт (fromSnapshot = false): markdown, report, about.',
        type: AiAnalyticsAuditResultDto,
    })
    @ApiForbiddenResponse({ description: FORBIDDEN_DESCRIPTION })
    @Post('audit')
    async run(
        @Body() dto: AiAnalyticsAuditRunDto,
    ): Promise<AiAnalyticsAuditResultDto> {
        return this.audit.run(dto.domain, {
            months: dto.months ?? AI_ANALYTICS_AUDIT_RUN_DEFAULTS.months,
            timeZone: dto.timeZone ?? AI_ANALYTICS_AUDIT_RUN_DEFAULTS.timeZone,
            save: dto.save ?? AI_ANALYTICS_AUDIT_RUN_DEFAULTS.save,
            source: 'admin',
        });
    }

    @ApiOperation({
        summary: 'Последний снапшот аудита домена',
        description:
            'Последняя запись ais типа ai-analytics-audit по домену (ручка или ' +
            'месячный крон) за 400 дней — та же форма, что у свежего отчёта, ' +
            'с fromSnapshot = true и source = admin | cron. Признаком портала ' +
            'не ограничена. 404 — снапшотов ещё нет.',
    })
    @ApiOkResponse({
        description: 'Снапшот (fromSnapshot = true)',
        type: AiAnalyticsAuditResultDto,
    })
    @ApiNotFoundResponse({ description: 'Снапшотов аудита по домену нет' })
    @Get('audit/latest')
    async latest(
        @Query() query: AiAnalyticsAuditLatestQueryDto,
    ): Promise<AiAnalyticsAuditResultDto> {
        const snapshot = await this.audit.latest(query.domain);
        if (!snapshot) {
            throw new NotFoundException(
                `Снапшотов аудита AI-аналитики по домену ${query.domain} ещё нет: запустите POST admin/ai-analytics/audit или дождитесь месячного крона`,
            );
        }
        return snapshot;
    }

    @ApiOperation({
        summary: 'Что делает аудит и как читать результат (самоописание)',
        description:
            'Единый текст для UI, Swagger и README: назначение, источники ' +
            'данных, границы, считаемые показатели (ключи report), разделы ' +
            'отчёта с правилами чтения, правило рекомендации по порогам, ' +
            'хранение, доступ и способы запуска. С параметром domain — ещё и ' +
            'состояние портала: признак ai_analytics_audit_enabled и дата ' +
            'последнего снапшота, чтобы UI показал, можно ли запускать.',
    })
    @ApiOkResponse({
        description: 'Самоописание и (при domain) состояние портала.',
        type: AiAnalyticsAuditAboutResponseDto,
    })
    @Get('audit/about')
    async about(
        @Query() query: AiAnalyticsAuditAboutQueryDto,
    ): Promise<AiAnalyticsAuditAboutResponseDto> {
        return {
            about: AI_ANALYTICS_AUDIT_ABOUT,
            portal: query.domain ? await this.audit.status(query.domain) : null,
        };
    }

    @ApiOperation({
        summary: 'Проба истории стадий сделок портала (crm.stagehistory.list)',
        description:
            'Ответ на вопрос владельцу A6: доступен ли на портале REST-метод ' +
            'crm.stagehistory.list и на сколько месяцев вглубь есть история ' +
            'переходов сделок по стадиям. На этом методе стоит шаг ' +
            'StageHistoryStep AI-аналитики ОП (путь сделки, ожидание от ' +
            'пайплайна, вероятностные рёбра воронки): без него шаг штатно ' +
            'деградирует, и половина модели считается только на синтетике. ' +
            'Два лёгких запроса к порталу по категории sales_base (не ' +
            'настроена — по всем воронкам сделок, о чём скажет hint): самая ' +
            'ранняя запись и число переходов за последние months месяцев. ' +
            'Ошибка Bitrix (нет прав/scope, метод недоступен, сеть) — не 500, ' +
            'а available = false с текстом в error. enough = true означает: ' +
            'метод доступен и глубина истории не меньше окна months — ' +
            'аналитика будет считаться по живым данным.',
    })
    @ApiOkResponse({
        description:
            'Результат пробы: доступность, самая ранняя запись, глубина в ' +
            'полных месяцах, переходов за окно, итог enough и вывод hint.',
        type: AiAnalyticsStageHistoryProbeResponseDto,
    })
    @Get('stage-history/probe')
    async probeStageHistory(
        @Query() query: AiAnalyticsStageHistoryProbeQueryDto,
    ): Promise<AiAnalyticsStageHistoryProbeResponseDto> {
        return this.stageHistoryProbe.probe(
            query.domain,
            query.months ?? AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.months,
        );
    }
}
