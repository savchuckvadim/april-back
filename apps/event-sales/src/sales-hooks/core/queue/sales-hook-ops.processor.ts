import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { CallSource } from '@lib/core/call-context';
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
    @CallSource(`queue:${JobNames.SALES_HOOK_LEAD_TO_WORK}`)
    handleLeadToWork(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_MERGE_DUPLICATES, concurrency: 1 })
    @CallSource(`queue:${JobNames.SALES_HOOK_MERGE_DUPLICATES}`)
    handleMergeDuplicates(job: Job<SalesHookJobData>) {
        // merge разрушающий и медленный — строго последовательно
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_TRANSFER_WORK, concurrency: 2 })
    @CallSource(`queue:${JobNames.SALES_HOOK_TRANSFER_WORK}`)
    handleTransferWork(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_REJECT_BUFFER, concurrency: 2 })
    @CallSource(`queue:${JobNames.SALES_HOOK_REJECT_BUFFER}`)
    handleRejectBuffer(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_CONVERT_NORMALIZER, concurrency: 2 })
    @CallSource(`queue:${JobNames.SALES_HOOK_CONVERT_NORMALIZER}`)
    handleConvertNormalizer(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_DUPLICATE_CHECK, concurrency: 2 })
    @CallSource(`queue:${JobNames.SALES_HOOK_DUPLICATE_CHECK}`)
    handleDuplicateCheck(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_LEAD_ACCEPT, concurrency: 2 })
    @CallSource(`queue:${JobNames.SALES_HOOK_LEAD_ACCEPT}`)
    handleLeadAccept(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    @Process({ name: JobNames.SALES_HOOK_LEAD_CLIENT, concurrency: 1 })
    @CallSource(`queue:${JobNames.SALES_HOOK_LEAD_CLIENT}`)
    handleLeadClient(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }

    /**
     * «Присоединить к основной»: кнопка «Присоединить сюда», блок «Открытые
     * сделки по клиенту» и робот. Без обработчика Bull валил каждую такую
     * джобу «Missing process handler» (найдено 12.10.2026). Переносит задачи,
     * дела и контакты между сделками — строго по одной.
     */
    @Process({ name: JobNames.SALES_HOOK_JOIN_TO_MAIN, concurrency: 1 })
    @CallSource(`queue:${JobNames.SALES_HOOK_JOIN_TO_MAIN}`)
    handleJoinToMain(job: Job<SalesHookJobData>) {
        return this.runner.run(job.data);
    }
}
