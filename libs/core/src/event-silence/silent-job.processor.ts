import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { resolveQueueConcurrency } from '@lib/queue/concurrency/resolve-queue-concurrency';
import { EventSilentJobManagerService } from './silent-job-manager.service';
import { EventSilentJobManagerData } from './event-silence.type';
import { QueueNames } from '@lib/queue';

/**
 * Сколько окон тишины собирается одновременно (env `EVENT_SILENT_CONCURRENCY`).
 *
 * Сборщик почти всё время ждёт тишины своего ключа (опрос Redis раз в
 * 500 мс), поэтому несколько сборщиков почти ничего не стоят. Один сборщик
 * на всё приложение держал окна ВСЕХ порталов и всех хуков, пока на один
 * ключ сыпалась долгая пачка (разбор 23.11.2026).
 */
export const EVENT_SILENT_COLLECTORS = resolveQueueConcurrency(
    'EVENT_SILENT_CONCURRENCY',
    8,
);

/**
 * Универсальный воркер для очереди event-silent. Ловит все джобы (`*`)
 * и делегирует обработку EventSilentJobManagerService.process.
 *
 * Окна разных ключей собираются параллельно. Одно окно не заберут дважды:
 * сбор и очистка данных — одна атомарная операция (collectAndClear).
 * Слушатели silence-событий объявлены без `{ async: true }` и тонкие: ставят
 * пачку в свою очередь исполнения, где и держится последовательность работы
 * (холодный старт — `EVENT_SALES_COLD_CALL_V2`, по одному окну на портал).
 */
@Injectable()
@Processor(QueueNames.EVENT_SILENT)
export class EventSilentJobProcessor {
    private readonly logger = new Logger(EventSilentJobProcessor.name);

    constructor(private readonly silentManager: EventSilentJobManagerService) {}

    @Process({ name: '*', concurrency: EVENT_SILENT_COLLECTORS })
    async handle<T>(job: Job<EventSilentJobManagerData<T>>): Promise<void> {
        this.logger.log(
            `Processing job id=${job.id} jobName=${job.data.jobName} domain=${job.data.domain}`,
        );
        await this.silentManager.process(job.data);
    }
}
