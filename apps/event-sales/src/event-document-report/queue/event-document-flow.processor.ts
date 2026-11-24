import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { annotateCallContext, CallSource } from '@lib/core/call-context';
import { JobNames, QueueConcurrencyService, QueueNames } from '@lib/queue';
import {
    EVENT_DOCUMENT_FLOW_CONCURRENCY,
    EVENT_DOCUMENT_MAX_PER_DOMAIN,
    EVENT_DOCUMENT_MAX_SLOT_RETRIES,
    EVENT_DOCUMENT_SLOT_RETRY_DELAY_MS,
} from '../constants/event-document-flow.const';
import { EventDocumentFlowJobData } from '../dto/event-document-flow-job.dto';
import { eventDocumentCallContext } from '../lib/event-document-call-context';
import { EventDocumentWriteError } from '../lib/event-document-write.error';
import { EventDocumentFlowStatusService } from '../services/status/event-document-flow-status.service';
import { EventDocumentReportUseCase } from '../use-cases/event-document-report.use-case';

/**
 * Воркер потока документов: событие «документ сформирован» из конструктора.
 *
 * Результата никто не ждёт (менеджер после генерации уходит в сделку),
 * поэтому ни статуса операции, ни WebSocket здесь нет — в отличие от
 * `EventFlowProcessor` отчёта о звонке. Сбой уходит в Telegram.
 *
 * Документы одного клиента идут строго по одному: счётчики считаются как
 * «прочитал + 1», и два документа подряд иначе потеряли бы единицу.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_DOCUMENT_FLOW)
export class EventDocumentFlowProcessor {
    private readonly logger = new Logger(EventDocumentFlowProcessor.name);

    constructor(
        private readonly useCase: EventDocumentReportUseCase,
        private readonly concurrency: QueueConcurrencyService,
        private readonly status: EventDocumentFlowStatusService,
    ) {
        // Без этой строки в логе не отличить «воркер не поднялся» от
        // «событий не было» — а в первом случае документы молча копятся.
        this.logger.log(
            `EventDocumentFlowProcessor initialized (concurrency=${EVENT_DOCUMENT_FLOW_CONCURRENCY}, ` +
                `maxPerDomain=${EVENT_DOCUMENT_MAX_PER_DOMAIN})`,
        );
    }

    @Process({
        name: JobNames.EVENT_SALES_DOCUMENT_FLOW,
        concurrency: EVENT_DOCUMENT_FLOW_CONCURRENCY,
    })
    @CallSource(
        `queue:${JobNames.EVENT_SALES_DOCUMENT_FLOW}`,
        'Очередь: поток документов',
    )
    async handle(job: Job<EventDocumentFlowJobData>): Promise<void> {
        const event = job.data;
        annotateCallContext(() => eventDocumentCallContext(event));

        const slot = await this.concurrency.acquire({
            queue: QueueNames.EVENT_SALES_DOCUMENT_FLOW,
            domain: event.domain,
            entityKey: `company:${event.companyId}`,
            maxPerDomain: EVENT_DOCUMENT_MAX_PER_DOMAIN,
            ownerId: event.eventId,
        });
        if (!slot.acquired) {
            await this.requeue(job, slot.reason);
            return;
        }
        try {
            await this.run(event);
        } finally {
            await slot.release();
        }
    }

    private async run(event: EventDocumentFlowJobData): Promise<void> {
        const { domain, eventId } = event;
        if (!(await this.status.reserve(domain, eventId))) {
            this.logger.warn(
                `[document-flow] ${domain}: событие ${eventId} уже выполнялось — ` +
                    'повторная доставка пропущена',
                { telegram: true, domain },
            );
            return;
        }
        try {
            const result = await this.useCase.execute(event);
            this.logger.log(
                `[document-flow] ${domain}: событие ${eventId} выполнено — ` +
                    `документы [${event.kinds.join(', ')}], сделка ${event.dealId}, ` +
                    `команд ${result.commands}`,
            );
        } catch (error) {
            // До записи не дошло — событие можно безопасно повторить.
            if (!(error instanceof EventDocumentWriteError)) {
                await this.status.release(domain, eventId);
            }
            this.logger.error(
                `[document-flow] ${domain}: событие ${eventId} не выполнено ` +
                    `(документы [${event.kinds.join(', ')}], сделка ${event.dealId}) — ` +
                    (error instanceof Error ? error.message : String(error)),
                { telegram: true, domain },
            );
            throw error;
        }
    }

    /**
     * Слот занят — джоб уезжает в конец очереди с задержкой. Именно
     * перекладка, а не ожидание в обработчике: воркер, стоящий на слоте,
     * не брал бы документы других клиентов.
     */
    private async requeue(
        job: Job<EventDocumentFlowJobData>,
        reason: string | undefined,
    ): Promise<void> {
        const { domain, eventId } = job.data;
        const retries = (job.data.slotRetries ?? 0) + 1;
        if (retries > EVENT_DOCUMENT_MAX_SLOT_RETRIES) {
            this.logger.error(
                `[document-flow] ${domain}: событие ${eventId} не дождалось слота ` +
                    `за ${EVENT_DOCUMENT_MAX_SLOT_RETRIES} попыток (${reason}) — документ не учтён`,
                { telegram: true, domain },
            );
            return;
        }
        await job.queue.add(
            JobNames.EVENT_SALES_DOCUMENT_FLOW,
            { ...job.data, slotRetries: retries },
            {
                delay: EVENT_DOCUMENT_SLOT_RETRY_DELAY_MS,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    }
}
