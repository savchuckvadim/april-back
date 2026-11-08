/**
 * Админ-ручки выгрузки PDF отчёта собственнику (просьба владельца
 * 07.11.2026): запуск сборки (джоба в общую очередь, воркер —
 * kpi-report-sales), состояние и скачивание готового файла. Сообщений не
 * шлёт, в Битрикс не пишет. Подключается только через
 * `SalesAiAnalyticsAdminModule` в apps/admin.
 */
import {
    Body,
    Controller,
    Get,
    NotFoundException,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard, Roles, RolesGuard } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ADMIN_TAG,
} from './admin-controller.const';
import {
    AiOwnerReportExportStartDto,
    AiOwnerReportExportStateDto,
    AiOwnerReportExportStatusResponseDto,
    AiOwnerReportExportTargetDto,
} from '../dto/ai-owner-report-export.dto';
import { AiOwnerReportExportService } from '../services/ai-owner-report-export.service';

export const AI_OWNER_REPORT_EXPORT_ROUTES = {
    start: 'owner-report-export',
    state: 'owner-report-export',
    file: 'owner-report-export/pdf',
} as const;

const NOT_READY = 'PDF ещё не готов или прошли сутки: сформируйте отчёт заново';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsOwnerReportExportAdminController {
    constructor(private readonly exporter: AiOwnerReportExportService) {}

    @ApiOperation({
        summary: 'Сформировать PDF отчёта собственнику за период',
        description:
            'Ставит джобу SALES_AI_ANALYTICS_OWNER_REPORT_EXPORT в очередь ' +
            'SALES_KPI_REPORT (воркер kpi-report-sales): готовый снапшот ' +
            'периода или сборка отчёта (forceRefresh — всегда заново, после ' +
            'переразбора), затем PDF в Redis на сутки. Только закрытые ' +
            'периоды. Идущая выгрузка того же периода не дублируется. ' +
            'Сообщений не шлёт, в Битрикс не пишет.',
    })
    @ApiBody({ type: AiOwnerReportExportStartDto })
    @ApiOkResponse({
        description: 'Состояние выгрузки сразу после постановки.',
        type: AiOwnerReportExportStateDto,
    })
    @Post(AI_OWNER_REPORT_EXPORT_ROUTES.start)
    start(
        @Body() dto: AiOwnerReportExportStartDto,
    ): Promise<AiOwnerReportExportStateDto> {
        return this.exporter.start({
            domain: dto.domain,
            kind: dto.kind,
            periodKey: dto.periodKey,
            forceRefresh: dto.forceRefresh === true,
        });
    }

    @ApiOperation({
        summary: 'Состояние выгрузки PDF отчёта собственнику',
        description:
            'queued / processing / ready / error; не запускали или прошли ' +
            'сутки — state = null. Опрашивать, пока не ready или error.',
    })
    @ApiOkResponse({ type: AiOwnerReportExportStatusResponseDto })
    @Get(AI_OWNER_REPORT_EXPORT_ROUTES.state)
    async state(
        @Query() query: AiOwnerReportExportTargetDto,
    ): Promise<AiOwnerReportExportStatusResponseDto> {
        return { state: await this.exporter.state(query) };
    }

    @ApiOperation({
        summary: 'Скачать готовый PDF отчёта собственнику',
        description: 'Файл готовой выгрузки; не готов — 404 с пояснением.',
    })
    @ApiProduces('application/pdf')
    @ApiOkResponse({
        description: 'PDF отчёта (attachment).',
        schema: { type: 'string', format: 'binary' },
    })
    @Get(AI_OWNER_REPORT_EXPORT_ROUTES.file)
    async file(
        @Query() query: AiOwnerReportExportTargetDto,
        @Res() res: Response,
    ): Promise<void> {
        const file = await this.exporter.file(query);
        if (!file) throw new NotFoundException(NOT_READY);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${file.filename}"`,
        );
        res.send(file.buffer);
    }
}
