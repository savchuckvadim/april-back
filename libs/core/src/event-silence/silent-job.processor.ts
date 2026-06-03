import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { EventSilentJobManagerService } from './silent-job-manager.service';
import { EventSilentJobManagerData } from './event-silence.type';

/**
 * Универсальный воркер для очереди event-silent. Ловит все джобы (`@Process('*')`)
 * и делегирует обработку EventSilentJobManagerService.process.
 *
 * Concurrency = 1 (default Bull) — это намеренно: новые job'ы от тех же ключей
 * выстраиваются в очередь и обрабатываются последовательно, не пересекаясь
 * с предыдущим handleHooks.
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
