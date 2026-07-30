import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    Logger,
    Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PBXService } from '@/modules/pbx';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { ReportGetRequestDto } from '../dto/kpi-report-request.dto';
import { KpiReportGetResponseDto } from '../dto/kpi-report-response.dto';
import { ReportKpiUseCase } from '../use-cases/kpi-report.use-case';
import { GetCallingStatisticDto } from '../dto/calling-statistic.dto';
import { CallingStatisticResponseDto } from '../dto/calling-statistic-response.dto';
import { CallingStatisticUseCase } from '../use-cases/kpi-calling-statistic.use-case';
import { ReportData } from '../../shared/dto/kpi.dto';
import { ICallingStatisticResult } from '../types/calling-statistic.type';
import {
    normalizeReportPeriod,
    NormalizedReportPeriod,
    ReportPeriodError,
} from '../../shared/lib/date-util';
import { ReportResultCacheService } from '../cache/report-result-cache.service';
import {
    buildCallingStatJobId,
    buildCallingStatResultKey,
    buildKpiReportJobId,
    buildKpiReportResultKey,
    buildReportRequestKey,
    buildReportUsersKey,
} from '../cache/report-cache-key.util';
import {
    CALLING_STAT_CACHE_APP,
    KPI_JOB_ATTEMPTS,
    KPI_JOB_BACKOFF_DELAY_MS,
    KPI_REPORT_CACHE_APP,
    KPI_REPORT_WS_EVENTS,
} from '../constants/report-queue.const';
import { CallingStatisticJob, ReportKpiJob } from '../dto/report-kpi.job.dto';

/**
 * KPI-отчёт и статистика звонков. Два режима (поле mode):
 *  - queue — «кэш-синхронно + очередь при промахе» (ai/rules/
 *    heavy-endpoint-queue.md): контроллер читает конверт из кэша и ставит
 *    Bull-job; compute только в SalesKpiReportQueueProcessor;
 *  - sync (default) — легаси-путь старого фронта: расчёт в HTTP-запросе,
 *    сырой массив в ответе. После перевода фронта будет удалён.
 */
@ApiTags('Sales Report')
@Controller('kpi-report')
export class KpiReportController {
    private readonly logger = new Logger(KpiReportController.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly queue: QueueDispatcherService,
        private readonly resultCache: ReportResultCacheService,
    ) {}

    @Post('get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'KPI-отчёт отдела продаж',
        description:
            'Показатели KPI по сотрудникам за период (счётчики действий из ' +
            'списка sales_kpi портала). Режим queue: мгновенный ответ ' +
            '{status: ready|queued|error}; готовый отчёт приходит ' +
            `WS-событием ${KPI_REPORT_WS_EVENTS.REPORT_DONE} на socketId ` +
            'либо поллингом (повторный POST до status ready). Даты: ' +
            'YYYY-MM-DD (обе границы включительно) или легаси DD.MM.YYYY ' +
            '(dateTo эксклюзивна). Без mode — легаси-синхронный расчёт, ' +
            'ответ сырым массивом ReportData[].',
    })
    @ApiBody({ type: ReportGetRequestDto })
    @ApiOkResponse({
        type: KpiReportGetResponseDto,
        description:
            'Конверт {status, data?, requestKey, message?}; в легаси-режиме ' +
            '(без mode) — сырой массив ReportData[].',
    })
    async getReport(
        @Body() dto: ReportGetRequestDto,
    ): Promise<KpiReportGetResponseDto | ReportData[]> {
        if (dto.mode === 'queue') {
            return this.handleReportQueue(dto);
        }
        this.logger.warn(
            `[${dto.domain}] deprecated sync-режим kpi-report/get — ` +
                'переведите клиент на mode=queue',
        );
        const reportKpiUseCase = new ReportKpiUseCase();
        await reportKpiUseCase.init(dto.domain, this.pbx, this.resultCache);
        return await reportKpiUseCase.generateKpiReport(dto.filters);
    }

    @Post('calling-statistic')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Счётная статистика звонков',
        description:
            'Счётчики звонков по 6 бакетам длительности на сотрудника ' +
            '(result_total voximplant.statistic.get, строки не выгружаются). ' +
            'Режим queue: мгновенный ответ {status: ready|queued|error}; ' +
            `готовый результат — WS ${KPI_REPORT_WS_EVENTS.CALLING_DONE} ` +
            'либо поллинг. Даты: YYYY-MM-DD (включительно) или легаси ' +
            'DD.MM.YYYY (dateTo эксклюзивна). Дроп команд лимитером — ' +
            'громкая ошибка расчёта, а не тихо неполные счётчики ' +
            '(инцидент 2026-07-28). Без mode — легаси-синхронный расчёт, ' +
            'ответ сырым массивом.',
    })
    @ApiBody({ type: GetCallingStatisticDto })
    @ApiOkResponse({
        type: CallingStatisticResponseDto,
        description:
            'Конверт {status, data?, requestKey, message?}; в легаси-режиме ' +
            '(без mode) — сырой массив элементов.',
    })
    async getCallingStatistic(
        @Body() dto: GetCallingStatisticDto,
    ): Promise<CallingStatisticResponseDto | ICallingStatisticResult[]> {
        if (dto.mode === 'queue') {
            return this.handleCallingQueue(dto);
        }
        this.logger.warn(
            `[${dto.domain}] deprecated sync-режим calling-statistic — ` +
                'переведите клиент на mode=queue',
        );
        const { bitrix } = await this.pbx.init(dto.domain);
        const callingStatisticUseCase = new CallingStatisticUseCase(
            bitrix.api,
            this.resultCache,
        );
        return await callingStatisticUseCase.get(dto);
    }

    private async handleReportQueue(
        dto: ReportGetRequestDto,
    ): Promise<KpiReportGetResponseDto> {
        const period = this.normalizePeriodOr400(
            dto.filters.dateFrom,
            dto.filters.dateTo,
        );
        const usersKey = buildReportUsersKey(
            dto.filters.departament.map(user => user.ID),
        );
        const resultKey = buildKpiReportResultKey(
            period.fromIso,
            period.toIsoInclusive,
            usersKey,
        );
        const requestKey = buildReportRequestKey(
            period.fromIso,
            period.toIsoInclusive,
            usersKey,
        );

        if (dto.forceRefresh !== true) {
            const envelope = await this.resultCache.getEnvelope<ReportData[]>(
                KPI_REPORT_CACHE_APP,
                dto.domain,
                resultKey,
            );
            if (envelope?.status === 'ready') {
                return { status: 'ready', data: envelope.data, requestKey };
            }
            if (envelope?.status === 'error') {
                return {
                    status: 'error',
                    message: envelope.message,
                    requestKey,
                };
            }
        }

        const jobData: ReportKpiJob = {
            domain: dto.domain,
            // Нормализованные даты: воркер детерминирован между ретраями,
            // легаси- и канон-запросы дают один и тот же job.
            filters: {
                ...dto.filters,
                dateFrom: period.fromIso,
                dateTo: period.toIsoInclusive,
            },
            socketId: dto.socketId,
            requestKey,
            resultKey,
        };
        await this.queue.dispatch(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_KPI_REPORT_GENERATE,
            jobData,
            buildKpiReportJobId(
                dto.domain,
                period.fromIso,
                period.toIsoInclusive,
                usersKey,
            ),
            this.jobOpts(),
        );
        return { status: 'queued', requestKey };
    }

    private async handleCallingQueue(
        dto: GetCallingStatisticDto,
    ): Promise<CallingStatisticResponseDto> {
        const period = this.normalizePeriodOr400(
            dto.filters.dateFrom,
            dto.filters.dateTo,
        );
        const usersKey = buildReportUsersKey(
            dto.filters.departament.map(user => user.ID),
        );
        const resultKey = buildCallingStatResultKey(
            period.fromIso,
            period.toIsoInclusive,
            usersKey,
        );
        const requestKey = buildReportRequestKey(
            period.fromIso,
            period.toIsoInclusive,
            usersKey,
        );

        if (dto.forceRefresh !== true) {
            const envelope = await this.resultCache.getEnvelope<
                CallingStatisticResponseDto['data']
            >(CALLING_STAT_CACHE_APP, dto.domain, resultKey);
            if (envelope?.status === 'ready') {
                return { status: 'ready', data: envelope.data, requestKey };
            }
            if (envelope?.status === 'error') {
                return {
                    status: 'error',
                    message: envelope.message,
                    requestKey,
                };
            }
        }

        const jobData: CallingStatisticJob = {
            domain: dto.domain,
            filters: {
                ...dto.filters,
                dateFrom: period.fromIso,
                dateTo: period.toIsoInclusive,
            },
            socketId: dto.socketId,
            requestKey,
            resultKey,
        };
        await this.queue.dispatch(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_CALLING_STATISTIC,
            jobData,
            buildCallingStatJobId(
                dto.domain,
                period.fromIso,
                period.toIsoInclusive,
                usersKey,
            ),
            this.jobOpts(),
        );
        return { status: 'queued', requestKey };
    }

    private normalizePeriodOr400(
        dateFrom: string,
        dateTo: string,
    ): NormalizedReportPeriod {
        try {
            return normalizeReportPeriod(dateFrom, dateTo);
        } catch (error) {
            if (error instanceof ReportPeriodError) {
                throw new BadRequestException(error.message);
            }
            throw error;
        }
    }

    private jobOpts() {
        return {
            attempts: KPI_JOB_ATTEMPTS,
            backoff: {
                type: 'fixed' as const,
                delay: KPI_JOB_BACKOFF_DELAY_MS,
            },
            removeOnComplete: true,
            removeOnFail: true,
        };
    }
}
