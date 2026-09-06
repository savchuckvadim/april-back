import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { AI_ANALYTICS_SNAPSHOT_KINDS } from '../constants/ai-analytics.const';
import { AuditSnapshotUseCase } from '../domain/use-cases/audit-snapshot.use-case';
import { AiAnalyticsPushUseCase } from '../domain/use-cases/push.use-case';
import { AiPushJobData } from '../dto/ai-push.dto';
import {
    AiAuditSnapshotResult,
    AiSnapshotJobData,
} from '../dto/ai-snapshot.dto';
import { AiPushResult } from '../domain/use-cases/push.types';

/**
 * Воркер AI-аналитики на очереди SALES_KPI_REPORT (рядом с
 * SalesFinanceQueueProcessor и остальными процессорами приложения).
 * Только dispatch по job name: расчёт и доставка push — в
 * AiAnalyticsPushUseCase (тот же код зовёт ручная ручка POST
 * ai-analytics/push), месячный снапшот аудита — в AuditSnapshotUseCase.
 * Ошибка — warn + rethrow: джоба помечается failed, ретраев нет
 * (attempts: 1), повтор — следующим тиком или вручную.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class AiAnalyticsQueueProcessor {
    private readonly logger = new Logger(AiAnalyticsQueueProcessor.name);

    constructor(
        private readonly push: AiAnalyticsPushUseCase,
        private readonly auditSnapshot: AuditSnapshotUseCase,
    ) {}

    @Process(JobNames.SALES_AI_ANALYTICS_PUSH)
    async handlePush(job: Job<AiPushJobData>): Promise<AiPushResult> {
        const { domain, kind, date } = job.data;
        this.logger.log(`SALES_AI_ANALYTICS_PUSH ${kind}: ${domain} ${date}`);
        try {
            const result = await this.push.execute({ domain, kind, date });
            this.logger.log(
                `Push ${kind} ${domain} ${date}: ${result.status}` +
                    (result.reason ? ` (${result.reason})` : '') +
                    `, доставлено ${result.delivered.length}`,
            );
            return result;
        } catch (error) {
            this.logger.warn(
                `Push ${kind} ${domain} ${date} упал: ${(error as Error).message}`,
            );
            throw error;
        }
    }

    @Process(JobNames.SALES_AI_ANALYTICS_SNAPSHOT)
    async handleSnapshot(
        job: Job<AiSnapshotJobData>,
    ): Promise<AiAuditSnapshotResult> {
        const { domain, kind, monthKey } = job.data;
        this.logger.log(
            `SALES_AI_ANALYTICS_SNAPSHOT ${kind}: ${domain} ${monthKey}`,
        );
        try {
            if (
                !(AI_ANALYTICS_SNAPSHOT_KINDS as readonly string[]).includes(
                    kind,
                )
            ) {
                throw new Error(`Неизвестный вид снапшота «${kind}»`);
            }
            const result = await this.auditSnapshot.execute({
                domain,
                monthKey,
            });
            this.logger.log(
                `Снапшот ${kind} ${domain} ${monthKey}: ${result.calls} звонков, ${result.analyzed} разборов`,
            );
            return result;
        } catch (error) {
            this.logger.warn(
                `Снапшот ${kind} ${domain} ${monthKey} упал: ${(error as Error).message}`,
            );
            throw error;
        }
    }
}
