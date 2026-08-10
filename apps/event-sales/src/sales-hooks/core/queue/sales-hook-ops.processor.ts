import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { SalesHookRunnerService } from '../services/sales-hook-runner.service';
import { SalesHookJobData } from '../contracts/sales-hook-job.type';

/**
 * Воркер очереди EVENT_SALES_HOOK_OPS: по методу на хук, вся логика — в
 * общем SalesHookRunnerService. concurrency: 2 — медленный хук (merge)
 * не блокирует быстрый (лид в работу).
 */
@Processor(QueueNames.EVENT_SALES_HOOK_OPS)
export class SalesHookOpsProcessor {
    private readonly logger = new Logger(SalesHookOpsProcessor.name);

    constructor(private readonly runner: SalesHookRunnerService) {
        // Конструкторный лог: если воркер не поднялся (модуль не подключён),
        // джобы молча копятся — отсутствие этой строки в логах и есть диагноз.
        this.logger.log('SalesHookOpsProcessor initialized');
    }

    @Process({ name: JobNames.SALES_HOOK_LEAD_TO_WORK, concurrency: 2 })
    handleLeadToWork(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_MERGE_DUPLICATES, concurrency: 1 })
    handleMergeDuplicates(job: Job<SalesHookJobData>) {
        // merge разрушающий и медленный — строго последовательно
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_TRANSFER_WORK, concurrency: 2 })
    handleTransferWork(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_REJECT_BUFFER, concurrency: 2 })
    handleRejectBuffer(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_CONVERT_NORMALIZER, concurrency: 2 })
    handleConvertNormalizer(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_DUPLICATE_CHECK, concurrency: 2 })
    handleDuplicateCheck(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }
}
