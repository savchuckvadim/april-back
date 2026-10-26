import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
import { JobNames } from 'src/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { PBXService } from '@/modules/pbx';
import { ReportResultCacheService } from '../../report';
import { DigestPartitionCacheService } from '../cache/digest-partition-cache.service';
import {
    KPI_DIGEST_CACHE_APP,
    KPI_DIGEST_RESULT_ERROR_TTL_SECONDS,
    KPI_DIGEST_WS_EVENTS,
} from '../constants/digest.const';
import type { KpiDigestJob } from '../dto/digest.job.dto';
import { DigestUseCase } from '../use-cases/digest.use-case';

/**
 * Воркер дневного дайджеста (очередь SALES_KPI_REPORT, паттерн —
 * SalesKpiReportQueueProcessor). Весь compute здесь: bitrix per-job через
 * pbx.init(domain), результат пишется в кэш use-case'ом (write-through) и
 * уходит клиенту по WS на socketId.
 *
 * Ошибка: Bull ретраит (attempts/backoff из контроллера); на ФИНАЛЬНОЙ
 * попытке — error-конверт в кэш (короткий TTL: поллинг получает status
 * error вместо вечного queued) + WS `*:error`; исключение пробрасывается —
 * job честно failed.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class KpiDigestQueueProcessor {
    private readonly logger = new Logger(KpiDigestQueueProcessor.name);

    constructor(
        private readonly ws: WsService,
        private readonly pbx: PBXService,
        private readonly resultCache: ReportResultCacheService,
        private readonly partitionCache: DigestPartitionCacheService,
    ) {}

    @Process(JobNames.SALES_DIGEST_GENERATE)
    async handleDigest(job: Job<KpiDigestJob>): Promise<void> {
        const { domain, filters, socketId, requestKey, forceRefresh } =
            job.data;
        this.logger.log(`SALES_DIGEST_GENERATE: ${domain} ${filters.date}`);
        try {
            const useCase = new DigestUseCase();
            await useCase.init(
                domain,
                this.pbx,
                this.partitionCache,
                this.resultCache,
            );
            const data = await useCase.generate(filters, { forceRefresh });
            this.notify(socketId, KPI_DIGEST_WS_EVENTS.DONE, {
                requestKey,
                data,
            });
        } catch (error) {
            await this.handleFailure(job, error);
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

    private async handleFailure(
        job: Job<KpiDigestJob>,
        error: unknown,
    ): Promise<void> {
        const { domain, socketId, requestKey, resultKey } = job.data;
        const message = error instanceof Error ? error.message : String(error);
        const attempts = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= attempts;
        this.logger.error(
            `[${domain}] ${KPI_DIGEST_WS_EVENTS.ERROR} (попытка ` +
                `${job.attemptsMade + 1}/${attempts}): ${message}`,
        );
        if (!isFinalAttempt) return;

        await this.resultCache.setError(
            KPI_DIGEST_CACHE_APP,
            domain,
            resultKey,
            message,
            KPI_DIGEST_RESULT_ERROR_TTL_SECONDS,
        );
        this.notify(socketId, KPI_DIGEST_WS_EVENTS.ERROR, {
            requestKey,
            message,
        });
    }
}
