import { Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { JobNames, QueueNames } from '@lib/queue';
import type { DealMovementJobData } from '@lib/sales-ai-analytics';
import { DealMovementRunService } from '../services/deal-movement-run.service';

/**
 * Кнопки админки «Посчитать» и «Посчитать сейчас»: прогон портала вне
 * расписания. Пока записи в сделки нет, «сейчас» — это внеочередной
 * ночной счёт: состояние и снимок дня сохраняются, сегодняшнюю ночь крон
 * уже не повторит.
 *
 * Замок портала общий с кроном: идёт другой прогон — джоб падает, и Bull
 * повторяет его через минуту (попытки и паузу задаёт админка). Сбой
 * самого счёта ошибкой джоба не считается: его итог уже в Telegram.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN)
export class DealMovementRunProcessor {
    private readonly logger = new Logger(DealMovementRunProcessor.name);

    constructor(private readonly runs: DealMovementRunService) {}

    @Process({ name: JobNames.EVENT_SALES_DEAL_MOVEMENT_RUN, concurrency: 1 })
    async handle(job: Job<DealMovementJobData>): Promise<void> {
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

    /** Последняя попытка не дождалась замка — сказать в Telegram. */
    @OnQueueFailed()
    onFailed(job: Job<DealMovementJobData>, error: Error): void {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < attempts) return;
        this.logger.warn(
            `Движение сделок ${job.data.domain}: прогон из админки не начат ` +
                `за ${attempts} попыток — ${error.message}`,
            { telegram: true },
        );
    }
}
