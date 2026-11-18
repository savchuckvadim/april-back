import { Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { JobNames, QueueNames } from '@lib/queue';
import { RopReportTicker } from '@lib/rop-reports';
import type { PeriodDigestJobData } from '@lib/sales-ai-analytics';
import { PeriodDigestDefinition } from '../period-digest.definition';

/**
 * Кнопка админки «Посчитать итоги периода»: подсчёт недели или месяца
 * портала вне расписания через движок отчётов РОПу (`runNow`): день и час
 * не проверяются, «включено» не важно, итог — в Telegram. Пока доставки
 * нет (Э7) — только подсчёт. Замок портала общий с кроном: идёт другой
 * прогон — джоб падает, и Bull повторяет его через минуту. Сбой самого
 * расчёта ошибкой джоба не считается: его итог уже в Telegram.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_PERIOD_DIGEST_RUN)
export class PeriodDigestRunProcessor {
    private readonly logger = new Logger(PeriodDigestRunProcessor.name);

    constructor(
        private readonly ticker: RopReportTicker,
        private readonly definition: PeriodDigestDefinition,
    ) {}

    @Process({ name: JobNames.EVENT_SALES_PERIOD_DIGEST_RUN, concurrency: 1 })
    async handle(job: Job<PeriodDigestJobData>): Promise<void> {
        const { domain, kind, periodKey } = job.data;
        this.logger.log(
            `Итоги периода ${domain}: подсчёт ${kind} ${periodKey ?? 'последнего закрытого'} из админки`,
        );
        const outcome = await this.ticker.runNow(this.definition, {
            domain,
            kind,
            ...(periodKey ? { periodKey } : {}),
            countOnly: true,
        });
        if (outcome.kind === 'busy') {
            throw new Error(
                `Итоги периода ${domain}: идёт другой прогон — повтор через минуту`,
            );
        }
    }

    /** Последняя попытка не дождалась замка — сказать в Telegram. */
    @OnQueueFailed()
    onFailed(job: Job<PeriodDigestJobData>, error: Error): void {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < attempts) return;
        this.logger.warn(
            `Итоги периода ${job.data.domain}: подсчёт из админки не начат ` +
                `за ${attempts} попыток — ${error.message}`,
            { telegram: true },
        );
    }
}
