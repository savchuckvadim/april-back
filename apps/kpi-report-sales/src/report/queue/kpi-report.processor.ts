import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
import { JobNames } from 'src/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { PBXService } from '@/modules/pbx';
import { ReportKpiUseCase } from '../use-cases/kpi-report.use-case';
import { CallingStatisticUseCase } from '../use-cases/kpi-calling-statistic.use-case';
import { ReportResultCacheService } from '../cache/report-result-cache.service';
import {
    CALLING_STAT_CACHE_APP,
    KPI_REPORT_CACHE_APP,
    KPI_REPORT_WS_EVENTS,
    KPI_RESULT_ERROR_TTL_SECONDS,
} from '../constants/report-queue.const';
import { CallingStatisticJob, ReportKpiJob } from '../dto/report-kpi.job.dto';

/**
 * Воркер KPI-отчёта и статистики звонков (очередь SALES_KPI_REPORT,
 * паттерн — SalesFinanceQueueProcessor). Весь compute здесь: bitrix
 * per-job через pbx.init(domain), результат пишется в кэш use-case'ом
 * (write-through) и уходит клиенту по WS на socketId.
 *
 * Ошибка: Bull ретраит (attempts/backoff из диспетчера); на ФИНАЛЬНОЙ
 * попытке — error-конверт в кэш (короткий TTL: поллинг получает status
 * error вместо вечного queued) + WS `*:error`; исключение всегда
 * пробрасывается — job честно failed.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class SalesKpiReportQueueProcessor {
    private readonly logger = new Logger(SalesKpiReportQueueProcessor.name);

    constructor(
        private readonly ws: WsService,
        private readonly pbx: PBXService,
        private readonly resultCache: ReportResultCacheService,
    ) {}

    @Process(JobNames.SALES_KPI_REPORT_GENERATE)
    async handleReport(job: Job<ReportKpiJob>): Promise<void> {
        const { domain, filters, socketId, requestKey } = job.data;
        this.logger.log(`SALES_KPI_REPORT_GENERATE: ${domain}`);
        try {
            const useCase = new ReportKpiUseCase();
            await useCase.init(domain, this.pbx, this.resultCache);
            const data = await useCase.generateKpiReport(filters);
            this.notify(socketId, KPI_REPORT_WS_EVENTS.REPORT_DONE, {
                requestKey,
                data,
            });
        } catch (error) {
            await this.handleFailure(
                job,
                KPI_REPORT_CACHE_APP,
                KPI_REPORT_WS_EVENTS.REPORT_ERROR,
                error,
            );
            throw error;
        }
    }

    @Process(JobNames.SALES_CALLING_STATISTIC)
    async handleCallingStatistic(job: Job<CallingStatisticJob>): Promise<void> {
        const { domain, filters, socketId, requestKey } = job.data;
        this.logger.log(`SALES_CALLING_STATISTIC: ${domain}`);
        try {
            const { bitrix } = await this.pbx.init(domain);
            const data = await new CallingStatisticUseCase(
                bitrix.api,
                this.resultCache,
            ).get({ domain, filters });
            this.notify(socketId, KPI_REPORT_WS_EVENTS.CALLING_DONE, {
                requestKey,
                data,
            });
        } catch (error) {
            await this.handleFailure(
                job,
                CALLING_STAT_CACHE_APP,
                KPI_REPORT_WS_EVENTS.CALLING_ERROR,
                error,
            );
            throw error;
        }
    }

    private notify(
        socketId: string | undefined,
        event: string,
        data: unknown,
    ): void {
        if (!socketId) return;
        this.ws.sendToClient(socketId, { event, data });
    }

    /** На финальной попытке — error-конверт в кэш + WS-событие; лог всегда. */
    private async handleFailure(
        job: Job<ReportKpiJob | CallingStatisticJob>,
        cacheApp: string,
        errorEvent: string,
        error: unknown,
    ): Promise<void> {
        const { domain, socketId, requestKey, resultKey } = job.data;
        const message = error instanceof Error ? error.message : String(error);
        const attempts = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= attempts;
        this.logger.error(
            `[${domain}] ${errorEvent} (попытка ${job.attemptsMade + 1}/` +
                `${attempts}): ${message}`,
        );
        if (!isFinalAttempt) return;

        await this.resultCache.setError(
            cacheApp,
            domain,
            resultKey,
            message,
            KPI_RESULT_ERROR_TTL_SECONDS,
        );
        this.notify(socketId, errorEvent, { requestKey, message });
    }
}
