import { Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { IColdHookSilenceHandlerData } from '../type/cold-hook-silence.interface';
import { ColdHooksHandlerV2Service } from '../services/silence/cold-hooks-handler.service';

/**
 * Обработка окна тишины холодного старта v2 — строго по одному окну.
 *
 * Окно читает связи клиента и только потом пишет работу (две фазы
 * `handleHooks`). Два окна по одному клиенту, идущие параллельно, читают
 * связи до записи друг друга, и каждое создаёт свою пару работ (gsr,
 * 07.10.2026: массовый ХО запустили дважды — 29 компаний получили по две
 * основные). Поэтому очередь своя, обработчик один, concurrency 1: следующее
 * окно стартует, когда предыдущее всё записало.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_COLD_CALL_V2)
export class ColdHooksV2Processor {
    private readonly logger = new Logger(ColdHooksV2Processor.name);

    constructor(private readonly hooksHandler: ColdHooksHandlerV2Service) {}

    @Process({ name: JobNames.EVENT_COLD_CALL_V2, concurrency: 1 })
    async handle(job: Job<IColdHookSilenceHandlerData>): Promise<void> {
        const { collected, payload } = job.data;
        this.logger.log(
            `[cold-v2 queue] jobId=${job.id} domain=${payload.domain} ` +
                `hooks=${Object.keys(collected).length} waitedMs=${Date.now() - job.timestamp}`,
        );
        await this.hooksHandler.handleHooks(payload.domain, collected);
    }

    @OnQueueFailed()
    onFailed(job: Job, error: Error): void {
        this.logger.error(
            `[cold-v2 queue] jobId=${job.id} упал: ${error.message}`,
        );
    }
}
