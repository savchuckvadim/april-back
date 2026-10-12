import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { EventSilentJobManagerService } from './silent-job-manager.service';
import { EventSilentJobManagerData } from './event-silence.type';
import { QueueNames } from '@lib/queue';

/**
 * Универсальный воркер для очереди event-silent. Ловит все джобы (`@Process('*')`)
 * и делегирует обработку EventSilentJobManagerService.process.
 *
 * Concurrency = 1 (default Bull) — окна разбираются по одному, пока слушатели
 * silence-событий ждутся (объявлены без `{ async: true }`). Слушатели тонкие:
 * ставят пачку в свою очередь исполнения, где и держится последовательность
 * работы (холодный старт — `EVENT_SALES_COLD_CALL[_V2]`, concurrency 1).
 */
@Injectable()
@Processor(QueueNames.EVENT_SILENT)
export class EventSilentJobProcessor {
    private readonly logger = new Logger(EventSilentJobProcessor.name);

    constructor(private readonly silentManager: EventSilentJobManagerService) {}

    @Process('*')
    async handle<T>(job: Job<EventSilentJobManagerData<T>>): Promise<void> {
        this.logger.log(
            `Processing job id=${job.id} jobName=${job.data.jobName} domain=${job.data.domain}`,
        );
        await this.silentManager.process(job.data);
    }
}
