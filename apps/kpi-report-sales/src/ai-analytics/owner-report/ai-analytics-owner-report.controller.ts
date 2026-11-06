import { toPortalDate } from '@lib/sales-ai-analytics';
import {
    Body,
    Controller,
    HttpCode,
    NotFoundException,
    Post,
    Res,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { OwnerReportDeliveryUseCase } from '../domain/use-cases/owner-report-delivery.use-case';
import { OwnerReportUseCase } from '../domain/use-cases/owner-report.use-case';
import {
    AiOwnerReportSendRequestDto,
    AiOwnerReportSendResponseDto,
} from '../dto/ai-owner-report-send.dto';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { OwnerReportPdfService } from './owner-report-pdf.service';
import { OwnerReportSnapshotReader } from './owner-report-snapshot.reader';
import { AI_OWNER_REPORT_ERRORS } from './owner-report.const';
import {
    AiOwnerReportRequestDto,
    AiOwnerReportResponseDto,
} from '../dto/ai-owner-report.dto';

@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsOwnerReportController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly ownerReport: OwnerReportUseCase,
        private readonly reader: OwnerReportSnapshotReader,
        private readonly pdfService: OwnerReportPdfService,
        private readonly settings: SettingsLoader,
        private readonly delivery: OwnerReportDeliveryUseCase,
    ) {}

    @PortalSessionProtected()
    @Post('owner-report')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отчёт собственнику за период (очередь + WS)',
        description:
            'Управленческий отчёт по отделу продаж за закрытый месяц, квартал, ' +
            'полугодие или год: исходы разговоров, конверсии по типам, недели, ' +
            'где теряем продажи, как управляется отдел, возражения, сбои, ' +
            'метрики контроля, сотрудники, методология. Только руководители ' +
            'cup|op. Ключ результата — ' +
            'sales-ai-analytics:v1:{domain}:owner-report:v1:{kind}:{periodKey}: ' +
            'попадание в кэш или готовый снапшот → ready; расчёт идёт → ' +
            'processing; промах → джоба SALES_AI_ANALYTICS_OWNER_REPORT ' +
            '(jobId = requestKey) → queued, по завершении WS ' +
            'ai-analytics:owner-report:done|error с requestKey — затем ' +
            'повторить POST. forceRefresh пересобирает. Текст резюме, утечек ' +
            'и карточек сотрудников пишет модель поверх шаблона с факт-чеком ' +
            'чисел; без модели приходит шаблон (source = template).',
    })
    @ApiBody({ type: AiOwnerReportRequestDto })
    @ApiOkResponse({
        type: AiOwnerReportResponseDto,
        description:
            'Конверт: при ready — отчёт в data; при queued/processing — ' +
            'дождаться WS и повторить POST; при error — текст в message.',
    })
    async get(
        @Body() dto: AiOwnerReportRequestDto,
    ): Promise<AiOwnerReportResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access, AI_ANALYTICS_ADMIN_ROLES);
        const lookup = await this.ownerReport.lookup(dto);
        switch (lookup.status) {
            case 'ready':
                return {
                    status: 'ready',
                    requestKey: lookup.requestKey,
                    data: lookup.data,
                };
            case 'error':
                return {
                    status: 'error',
                    requestKey: lookup.requestKey,
                    message: lookup.message,
                };
            default:
                return {
                    status: lookup.status,
                    requestKey: lookup.requestKey,
                    jobId: lookup.jobId,
                };
        }
    }

    @PortalSessionProtected()
    @Post('owner-report/pdf')
    @HttpCode(200)
    @ApiOperation({
        summary: 'PDF отчёта собственнику за период',
        description:
            'Готовый отчёт периода (снапшот) в PDF: те же разделы, что на ' +
            'витрине, шрифты встроены, нумерация страниц. Отчёт должен быть ' +
            'уже собран ручкой owner-report — иначе 404. Только cup|op.',
    })
    @ApiBody({ type: AiOwnerReportRequestDto })
    @ApiProduces('application/pdf')
    @ApiResponse({
        status: 200,
        description: 'PDF-файл отчёта',
        schema: { type: 'string', format: 'binary' },
    })
    async pdf(
        @Body() dto: AiOwnerReportRequestDto,
        @Res() res: Response,
    ): Promise<void> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access, AI_ANALYTICS_ADMIN_ROLES);
        const bounds = await this.ownerReport.resolveBounds(dto, new Date());
        const report = await this.reader.read(
            dto.domain,
            dto.kind,
            bounds.periodKey,
        );
        if (!report)
            throw new NotFoundException(AI_OWNER_REPORT_ERRORS.notBuilt);
        const { calendar } = await this.settings.load(dto.domain);
        const rendered = await this.pdfService.render(
            report,
            calendar.timeZone,
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${rendered.filename}"`,
        );
        res.setHeader('Content-Length', rendered.buffer.length.toString());
        res.end(rendered.buffer);
    }

    @PortalSessionProtected()
    @Post('owner-report/send')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выпустить отчёт собственнику сейчас',
        description:
            'Тот же код, что у крона 2-го рабочего дня: снапшот периода (или ' +
            'сборка на месте — до пары минут), PDF на Диск портала, личные ' +
            'сообщения получателям. recipients — тест «отправить себе» вместо ' +
            'настроек портала (режим «только считать» на них не действует). ' +
            'Только cup|op.',
    })
    @ApiBody({
        type: AiOwnerReportSendRequestDto,
        description:
            'Вид и ключ периода (как у owner-report) плюс необязательный ' +
            'список получателей для теста.',
    })
    @ApiOkResponse({
        type: AiOwnerReportSendResponseDto,
        description:
            'Конверт со status = ready и итогом выпуска в data: статус ' +
            'доставки, причина пропуска, кому доставлено, ссылка на PDF.',
    })
    async send(
        @Body() dto: AiOwnerReportSendRequestDto,
    ): Promise<AiOwnerReportSendResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access, AI_ANALYTICS_ADMIN_ROLES);
        const now = new Date();
        const bounds = await this.ownerReport.resolveBounds(dto, now);
        const { calendar } = await this.settings.load(dto.domain);
        const data = await this.delivery.execute(
            {
                domain: dto.domain,
                kind: dto.kind,
                periodKey: bounds.periodKey,
                date: toPortalDate(now, calendar.timeZone),
                ...(dto.recipients?.length
                    ? { recipients: dto.recipients }
                    : {}),
            },
            now,
        );
        return {
            status: 'ready',
            requestKey: `${dto.domain}:owner-report-send:${dto.kind}:${bounds.periodKey}`,
            data,
        };
    }
}
