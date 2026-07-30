import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
import { JobNames } from 'src/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { PBXService } from '@/modules/pbx';
import type { IsoMonth } from '../../shared/lib/month-segments.util';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import { AirtimeMarkerCacheService } from '../cache/airtime-marker-cache.service';
import { AIRTIME_WS_EVENTS } from '../constants/airtime-queue.const';
import { AirtimeAssemblyService } from '../services/airtime-assembly.service';
import { AirtimeMonthCollectorUseCase } from '../use-cases/airtime-month-collector.use-case';
import { AirtimeDaySpanCollectorUseCase } from '../use-cases/airtime-day-span-collector.use-case';
import type {
    AirtimeDaySpanJobData,
    AirtimeMonthJobData,
} from './airtime-job.dto';
import type {
    AirtimeDoneEventPayload,
    AirtimeErrorEventPayload,
    AirtimeProgressEventPayload,
} from '../types/airtime-statistic.type';

/**
 * Воркер партиций эфирного времени (очередь SALES_KPI_REPORT, прецедент —
 * SalesFinanceQueueProcessor). Весь compute здесь: bitrix-инстанс per-job
 * через pbx.init(domain) — в this только bitrix-stateless инфраструктура
 * (правило CLAUDE.md про race condition).
 *
 * Concurrency Bull по умолчанию (1 на имя job'а): месяцы собираются
 * последовательно — рейт-лимитер Битрикса не перегружается. Доставка:
 * progress/done/error адресно на socketId ПЕРВОГО запросившего; остальные
 * подписчики того же jobId доезжают поллингом (повторный POST).
 *
 * Ошибка: ретраи Bull (attempts/backoff из диспетчера); на ФИНАЛЬНОЙ
 * попытке — error-маркер месяца (короткий TTL: поллинг получает status
 * 'error' вместо вечного queued) + WS airtime:error; исключение всегда
 * пробрасывается — job честно помечается failed.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class AirtimeQueueProcessor {
    private readonly logger = new Logger(AirtimeQueueProcessor.name);

    constructor(
        private readonly ws: WsService,
        private readonly pbx: PBXService,
        private readonly cellCache: AirtimeCacheService,
        private readonly markerCache: AirtimeMarkerCacheService,
        private readonly assembly: AirtimeAssemblyService,
    ) {}

    @Process(JobNames.AIRTIME_MONTH_PARTITION)
    async handleMonthPartition(job: Job<AirtimeMonthJobData>): Promise<void> {
        const { domain, month } = job.data;
        this.logger.log(`AIRTIME_MONTH_PARTITION: ${domain} ${month}`);
        try {
            const startedAt = Date.now();
            const { bitrix } = await this.pbx.init(domain);
            await new AirtimeMonthCollectorUseCase(
                bitrix.api,
                this.cellCache,
                this.markerCache,
                domain,
            ).collect(month);
            await this.recordDuration(domain, 'month', startedAt);
            await this.notifyProgress(job.data, month);
        } catch (error) {
            await this.handleFailure(job, month, error);
            throw error;
        }
    }

    @Process(JobNames.AIRTIME_DAY_SPAN)
    async handleDaySpan(job: Job<AirtimeDaySpanJobData>): Promise<void> {
        const { domain, from, to, forceRefresh, month } = job.data;
        this.logger.log(`AIRTIME_DAY_SPAN: ${domain} ${from}..${to}`);
        try {
            const startedAt = Date.now();
            const { bitrix } = await this.pbx.init(domain);
            await new AirtimeDaySpanCollectorUseCase(
                bitrix.api,
                this.cellCache,
                this.markerCache,
                domain,
            ).collect(from, to, forceRefresh);
            await this.recordDuration(domain, 'span', startedAt);
            await this.notifyProgress(job.data, month);
        } catch (error) {
            await this.handleFailure(job, month, error);
            throw error;
        }
    }

    /** Замер длительности сбора — питает оценку ETA (ошибки не роняют job). */
    private async recordDuration(
        domain: string,
        kind: 'month' | 'span',
        startedAt: number,
    ): Promise<void> {
        try {
            await this.markerCache.recordDuration(
                domain,
                kind,
                Date.now() - startedAt,
            );
        } catch (error) {
            this.logger.warn(
                `[${domain}] не удалось записать замер длительности: ` +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    /**
     * После сбора партиции: перепроверить готовность ВСЕГО периода исходного
     * запроса и отправить прогресс; всё готово — событие done (фронт заберёт
     * отчёт повторным POST из кэша).
     */
    private async notifyProgress(
        data: AirtimeMonthJobData | AirtimeDaySpanJobData,
        collectedMonth: IsoMonth,
    ): Promise<void> {
        const { socketId, requestKey, domain, dateFrom, dateTo } = data;
        if (!socketId) return;

        const readiness = await this.assembly.checkReadiness(
            domain,
            dateFrom,
            dateTo,
            false,
        );
        const progress: AirtimeProgressEventPayload = {
            requestKey,
            month: collectedMonth,
            totalMonths: readiness.totalMonths,
            readyMonths: readiness.readyMonths,
            months: readiness.months,
            ...(readiness.etaSeconds !== undefined
                ? { etaSeconds: readiness.etaSeconds }
                : {}),
        };
        this.send(socketId, AIRTIME_WS_EVENTS.PROGRESS, progress);

        if (readiness.allReady) {
            const done: AirtimeDoneEventPayload = { requestKey };
            this.send(socketId, AIRTIME_WS_EVENTS.DONE, done);
        }
    }

    /** На финальной попытке — error-маркер + WS-событие; лог всегда. */
    private async handleFailure(
        job: Job<AirtimeMonthJobData | AirtimeDaySpanJobData>,
        month: IsoMonth,
        error: unknown,
    ): Promise<void> {
        const { domain, socketId, requestKey } = job.data;
        const message = error instanceof Error ? error.message : String(error);
        const attempts = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= attempts;
        this.logger.error(
            `[${domain}] партиция ${month} упала ` +
                `(попытка ${job.attemptsMade + 1}/${attempts}): ${message}`,
        );
        if (!isFinalAttempt) return;

        await this.markerCache.setErrorMarker(domain, month, {
            message,
            failedAt: new Date().toISOString(),
        });
        if (socketId) {
            const payload: AirtimeErrorEventPayload = {
                requestKey,
                month,
                message,
            };
            this.send(socketId, AIRTIME_WS_EVENTS.ERROR, payload);
        }
    }

    private send(socketId: string, event: string, data: unknown): void {
        this.ws.sendToClient(socketId, { event, data });
    }
}
