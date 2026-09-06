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
} from '../audit/ai-analytics-audit.about';
import { AiAnalyticsAuditService } from './ai-analytics-audit.service';
import {
    AiAnalyticsAuditAboutQueryDto,
    AiAnalyticsAuditAboutResponseDto,
} from './dto/ai-analytics-audit-about.dto';
import { AiAnalyticsAuditLatestQueryDto } from './dto/ai-analytics-audit-latest-query.dto';
import { AiAnalyticsAuditResultDto } from './dto/ai-analytics-audit-result.dto';
import {
    AI_ANALYTICS_AUDIT_RUN_DEFAULTS,
    AiAnalyticsAuditRunDto,
} from './dto/ai-analytics-audit-run.dto';

const FORBIDDEN_DESCRIPTION =
    'На портале выключен признак ai_analytics_audit_enabled («Аудит и ' +
    'калибровка данных AI-аналитики разрешены») — включите его в ' +
    'настройках приложения kpi-sales портала';

/**
 * Аудит данных AI-аналитики ОП по живой БД (Фаза 0 плана) — только
 * SUPER_USER и только для порталов с признаком ai_analytics_audit_enabled:
 * запуск с записью снапшота в ais, чтение последнего снапшота (тот же,
 * что пишет месячный крон kpi-report-sales) и самоописание для UI.
 */
@ApiTags('Sales AI Analytics Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_USER)
@Controller('admin/ai-analytics')
export class SalesAiAnalyticsAdminController {
    constructor(private readonly audit: AiAnalyticsAuditService) {}

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
}
