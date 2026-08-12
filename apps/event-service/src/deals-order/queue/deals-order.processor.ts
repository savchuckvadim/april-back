import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { TelegramService } from '@lib/telegram/telegram.service';
import { SendDealsWarningsUseCase } from '../usecases/send-deals-warnings.use-case';

@Injectable()
@Processor(QueueNames.SERVICE_DEALS_ORDER)
export class DealsOrderProcessor {
    private readonly logger = new Logger(DealsOrderProcessor.name);

    constructor(
        private readonly sendDealsWarningsUseCase: SendDealsWarningsUseCase,
        private readonly telegramService: TelegramService,
    ) {
        this.logger.log(
            `DealsOrderProcessor registered (queue: ${QueueNames.SERVICE_DEALS_ORDER})`,
        );
    }

    /**
     * Ошибки внутри Bull-воркера не доходят до cron-обработчика в
     * SchedulerService (его try/catch покрывает только постановку job
     * в очередь), поэтому старт/итог/падение репортим отсюда — в лог и TG.
     */
    @Process(JobNames.SERVICE_DEALS_ORDER)
    async handle() {
        this.logger.log('SERVICE_DEALS_ORDER: job started');
        await this.telegramService.sendMessage(
            '📦 deals-order: job взят из очереди, начинаю анализ сделок',
        );

        try {
            const result = await this.sendDealsWarningsUseCase.execute();
            const summary =
                `✅ deals-order: анализ завершён | mode=${result.mode} | ` +
                `отчётов по сотрудникам: ${result.employeeReportsCount} | ` +
                `отправлено сотрудникам: ${
                    result.sentTo.length
                        ? result.sentTo.join(', ')
                        : `никому (mode=${result.mode})`
                } | ` +
                `админу ${result.adminUserId}: ${result.adminMessagesCount} сообщ.`;
            this.logger.log(summary);
            await this.telegramService.sendMessage(summary);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(
                `SERVICE_DEALS_ORDER: job failed: ${message}`,
                err instanceof Error ? err.stack : undefined,
            );
            await this.telegramService.sendMessage(
                `❌ deals-order: job упал: ${message}`,
            );
            throw err;
        }
    }
}
