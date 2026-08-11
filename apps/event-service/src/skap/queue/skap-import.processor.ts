import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames, QueueNames } from '@lib/queue';
import { SkapImportRunUseCase } from '../use-cases/skap-import-run.use-case';

export interface SkapImportRunJobData {
    domain: string;
}

/**
 * concurrency читается на этапе декорации класса — только process.env
 * (ConfigService ещё недоступен).
 */
function resolveConcurrency(envName: string, fallback: number): number {
    const raw = Number(process.env[envName]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Воркер импорта СКАП: один run-джоб на домен (jobId={domain}:run — Bull
 * отсекает дубли). Домены обрабатываются параллельно до concurrency,
 * внутри домена — строго последовательный прогон с тайм-бюджетом.
 */
@Processor(QueueNames.SKAP_IMPORT)
export class SkapImportProcessor {
    private readonly logger = new Logger(SkapImportProcessor.name);

    constructor(private readonly runUseCase: SkapImportRunUseCase) {
        // Диагностика неподнятого воркера: строка в логах при старте.
        this.logger.log('SkapImportProcessor initialized');
    }

    @Process({
        name: JobNames.SKAP_IMPORT_RUN,
        concurrency: resolveConcurrency('SKAP_IMPORT_CONCURRENCY', 2),
    })
    async handleRun(job: Job<SkapImportRunJobData>): Promise<void> {
        const { domain } = job.data;
        try {
            const result = await this.runUseCase.execute(domain);
            this.logger.log(
                `Прогон СКАП завершён (${domain}): файлов ${result.stats.filesProcessed}/${result.stats.filesFound}, ` +
                    `создано ${result.stats.itemsCreated}, обновлено ${result.stats.itemsUpdated}, ` +
                    `без компании ${result.stats.itemsSkippedNoCompany}, сессий ${result.stats.sessionsSaved}` +
                    (result.stopReason ? `, стоп: ${result.stopReason}` : ''),
            );
        } catch (error) {
            const isLastAttempt =
                job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
            this.logger.error(
                `Прогон СКАП упал (${domain}): ${(error as Error).message}`,
                { ...(isLastAttempt ? { telegram: true } : {}), domain },
            );
            throw error;
        }
    }
}
