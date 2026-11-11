import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PBXService } from '@lib/pbx';
import { runAsInteractive } from '@lib/core/call-context';
import { RedisService } from '@lib/core/redis/redis.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { resolveQueueConcurrency } from '@lib/queue/concurrency/resolve-queue-concurrency';
import { DealSendJobDto } from '../dto/deal-send-job.dto';
import {
    DealSendWriteResult,
    DealSendWriterService,
} from '../services/deal-send-writer.service';
import {
    dealSendLatestKey,
    describeDealSendError,
} from '../lib/deal-send-job.options';

/**
 * Сколько сохранений писать одновременно. Запись — 1–2 лёгких вызова Bitrix;
 * один воркер означал бы, что портал, упёршийся в лимит Bitrix, держит
 * очередь всех остальных. Порядок по одной сделке держит проверка
 * «последнего сохранения» (isSuperseded).
 */
const DEAL_SEND_CONCURRENCY = resolveQueueConcurrency(
    'KONSTRUCTOR_DEAL_SEND_CONCURRENCY',
    5,
);

@Processor(QueueNames.KONSTRUCTOR_DEAL_SEND)
export class DealSendProcessor {
    private readonly logger = new Logger(DealSendProcessor.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly redisService: RedisService,
    ) {}

    /**
     * Результат (число полей и строк) Bull кладёт в job.returnvalue — его
     * отдаёт GET konstructor/deal-send/status/{operationId}.
     *
     * Класс вызова — интерактивный: менеджер ждёт записи, фронт опрашивает
     * статус ограниченное время, а фоновый класс у ограничителя Bitrix может
     * ждать минутами.
     */
    @Process({
        name: JobNames.KONSTRUCTOR_DEAL_SEND,
        concurrency: DEAL_SEND_CONCURRENCY,
    })
    async handle(job: Job<DealSendJobDto>): Promise<DealSendWriteResult> {
        const attempt = `попытка ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`;
        this.logger.log(
            `${JobNames.KONSTRUCTOR_DEAL_SEND}: ${job.data.domain} сделка ${job.data.dealId} (${attempt}, operationId ${String(job.id)})`,
        );
        if (await this.isSuperseded(job)) {
            this.logger.log(
                `${JobNames.KONSTRUCTOR_DEAL_SEND}: ${job.data.domain} сделка ${job.data.dealId} — пропущено, есть более позднее сохранение (operationId ${String(job.id)})`,
            );
            return { fields: 0, rows: null, superseded: true };
        }
        try {
            return await runAsInteractive(
                JobNames.KONSTRUCTOR_DEAL_SEND,
                async () => {
                    const { bitrix } = await this.pbx.init(job.data.domain);
                    return await new DealSendWriterService(bitrix).write(
                        job.data,
                    );
                },
            );
        } catch (error) {
            this.logger.error(
                `${JobNames.KONSTRUCTOR_DEAL_SEND}: ${job.data.domain} сделка ${job.data.dealId} не записана (${attempt}) — ${describeDealSendError(error)}`,
            );
            throw error;
        }
    }

    /**
     * Bull шлёт failed на каждую упавшую попытку (attemptsMade уже увеличен).
     * Тревога — один раз, когда повторов больше не будет: фронт к этому
     * моменту уже отправил запись в легаси или показал ошибку.
     */
    @OnQueueFailed()
    onFailed(job: Job<DealSendJobDto>, error: Error): void {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < attempts) {
            return;
        }
        this.logger.error(
            `${JobNames.KONSTRUCTOR_DEAL_SEND}: ${job.data.domain} сделка ${job.data.dealId} НЕ ЗАПИСАНА после ${attempts} попыток (operationId ${String(job.id)}) — ${error?.message ?? 'без текста'}`,
            { telegram: true },
        );
    }

    /**
     * Есть более позднее сохранение этой сделки (смарта): старое задание —
     * повтор после паузы или параллельный воркер — его не перетирает.
     * Redis недоступен — пишем, как раньше: запись важнее порядка.
     */
    private async isSuperseded(job: Job<DealSendJobDto>): Promise<boolean> {
        try {
            const latest = await this.redisService
                .getClient()
                .get(dealSendLatestKey(job.data));
            return Boolean(latest) && latest !== String(job.id);
        } catch (error) {
            this.logger.warn(
                `${JobNames.KONSTRUCTOR_DEAL_SEND}: не проверить последнее сохранение ${job.data.domain} ${job.data.dealId} — пишем: ${describeDealSendError(error)}`,
            );
            return false;
        }
    }
}
