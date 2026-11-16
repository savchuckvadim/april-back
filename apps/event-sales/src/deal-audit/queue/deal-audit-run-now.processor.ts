import { Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DealAuditRunNowJobData, JobNames, QueueNames } from '@lib/queue';
import { DealAuditScheduler } from '../deal-audit.scheduler';

/**
 * Кнопка админки «Сформировать и отправить»: прогон портала вне
 * расписания, как у крона (разметка + сводки, итог в Telegram).
 *
 * Джоб активен, пока идёт прогон: админка по нему видит «уже идёт» и не
 * ставит вторую рассылку следом. Лок общий с кроном. Если идёт другой
 * прогон, джоб падает, и Bull повторяет его через минуту (попытки и паузу
 * задаёт админка). Так нажатие не теряется, пока крон дорабатывает
 * соседний портал.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_DEAL_AUDIT_RUN)
export class DealAuditRunNowProcessor {
    private readonly logger = new Logger(DealAuditRunNowProcessor.name);

    constructor(private readonly scheduler: DealAuditScheduler) {}

    @Process({ name: JobNames.EVENT_SALES_DEAL_AUDIT_RUN_NOW, concurrency: 1 })
    async handle(job: Job<DealAuditRunNowJobData>): Promise<void> {
        const { domain } = job.data;
        this.logger.log(`Аудит сделок ${domain}: ручной прогон из админки`);
        const started = await this.scheduler.runNowAndWait(domain);
        if (!started) {
            throw new Error(
                `Аудит сделок ${domain}: идёт другой прогон — повтор через минуту`,
            );
        }
    }

    /** Последняя попытка не дождалась лока — сказать в Telegram, а не молчать. */
    @OnQueueFailed()
    onFailed(job: Job<DealAuditRunNowJobData>, error: Error): void {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < attempts) return;
        this.logger.warn(
            `Аудит сделок ${job.data.domain}: ручной прогон из админки не ` +
                `начат за ${attempts} попыток — ${error.message}`,
            { telegram: true },
        );
    }
}
