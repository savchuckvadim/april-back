import { Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import {
    annotateCallContext,
    callEntity,
    CallSource,
} from '@lib/core/call-context';
import { Job } from 'bull';
import { JobNames, QueueNames } from '@lib/queue';
import type {
    DealMovementJobData,
    DealMovementProbeJobData,
} from '@lib/sales-ai-analytics';
import { DealMovementProbeService } from '../services/deal-movement-probe.service';
import { DealMovementRunService } from '../services/deal-movement-run.service';

/** Имя джобы прогона строкой: `job.name` у Bull — просто строка. */
const RUN_JOB_NAME: string = JobNames.EVENT_SALES_DEAL_MOVEMENT_RUN;

/**
 * Кнопки админки движения сделок:
 * - «Посчитать» и «Посчитать сейчас» — прогон портала вне расписания
 *   («сейчас» — внеочередной счёт: состояние и снимок дня сохраняются,
 *   в ленты НЕ пишет — записи делает только ночной счёт; сегодняшнюю ночь
 *   крон уже не повторит). Замок портала общий с кроном: идёт другой
 *   прогон — джоб падает, и Bull повторяет его через минуту. Сбой самого
 *   счёта ошибкой джоба не считается: его итог уже в Telegram.
 * - «Проверить запись в ленту» — одна сделка, без повторов: пишет в живой
 *   портал, итог — в Redis (сбой тоже).
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN)
export class DealMovementRunProcessor {
    private readonly logger = new Logger(DealMovementRunProcessor.name);

    constructor(
        private readonly runs: DealMovementRunService,
        private readonly probes: DealMovementProbeService,
    ) {}

    @Process({ name: JobNames.EVENT_SALES_DEAL_MOVEMENT_RUN, concurrency: 1 })
    @CallSource(
        `queue:${JobNames.EVENT_SALES_DEAL_MOVEMENT_RUN}`,
        'Очередь: движение сделок (из админки)',
    )
    async handle(job: Job<DealMovementJobData>): Promise<void> {
        annotateCallContext({ domain: job.data.domain });
        const { domain, dryRun, requestedBy } = job.data;
        this.logger.log(
            `Движение сделок ${domain}: ${dryRun ? 'подсчёт' : 'счёт'} из админки`,
        );
        const outcome = await this.runs.run(
            domain,
            dryRun ? 'dry-run' : 'count',
            requestedBy,
        );
        if (outcome.kind === 'busy') {
            throw new Error(
                `Движение сделок ${domain}: идёт другой прогон — повтор через минуту`,
            );
        }
    }

    @Process({ name: JobNames.EVENT_SALES_DEAL_MOVEMENT_PROBE, concurrency: 1 })
    @CallSource(
        `queue:${JobNames.EVENT_SALES_DEAL_MOVEMENT_PROBE}`,
        'Очередь: движение сделок (проверка записи)',
    )
    async probe(job: Job<DealMovementProbeJobData>): Promise<void> {
        annotateCallContext({
            domain: job.data.domain,
            entity: callEntity('deal', job.data.dealId),
        });
        await this.probes.run(job.data);
    }

    /** Последняя попытка прогона не дождалась замка — сказать в Telegram. */
    @OnQueueFailed()
    onFailed(job: Job<DealMovementJobData>, error: Error): void {
        // Сбой проверки записи в ленту — её итог уже в Redis, не тревога.
        if (job.name !== RUN_JOB_NAME) return;
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < attempts) return;
        this.logger.warn(
            `Движение сделок ${job.data.domain}: прогон из админки не начат ` +
                `за ${attempts} попыток — ${error.message}`,
            { telegram: true },
        );
    }
}
