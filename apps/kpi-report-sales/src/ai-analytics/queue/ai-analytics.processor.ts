import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger, Optional } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { AI_ANALYTICS_SNAPSHOT_KINDS } from '../constants/ai-analytics.const';
import { AuditSnapshotUseCase } from '../domain/use-cases/audit-snapshot.use-case';
import { OverviewJobUseCase } from '../domain/use-cases/overview-job.use-case';
import { AiAnalyticsPushUseCase } from '../domain/use-cases/push.use-case';
import { AiOverviewJobData } from '../dto/ai-overview-request.dto';
import { AiPushJobData } from '../dto/ai-push.dto';
import {
    AiAuditSnapshotResult,
    AiPipelineRunSummary,
    AiSnapshotJobData,
} from '../dto/ai-snapshot.dto';
import {
    AI_ANALYTICS_SNAPSHOT_RUNNER,
    AiSnapshotRunner,
} from '../steps/step.types';
import { AiPushResult } from '../domain/use-cases/push.types';

/**
 * Воркер AI-аналитики на очереди SALES_KPI_REPORT (рядом с
 * SalesFinanceQueueProcessor и остальными процессорами приложения).
 * Только dispatch по job name: расчёт и доставка push — в
 * AiAnalyticsPushUseCase (тот же код зовёт ручная ручка POST
 * ai-analytics/push), месячный снапшот аудита — в AuditSnapshotUseCase,
 * обзор (Фаза 1b) — в OverviewJobUseCase (расчёт, write-through в кэш,
 * WS done/error). Ошибка — warn + rethrow: джоба помечается failed,
 * ретраев нет (attempts: 1), повтор — следующим тиком или вручную.
 *
 * Снапшот-джоба диспетчеризуется по виду (план §5.3): `audit` — месячный
 * аудит Фазы 0, остальные виды — ритмы ночного конвейера Фазы 2
 * (у них свои опции: две попытки и таймаут 15 минут).
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class AiAnalyticsQueueProcessor {
    private readonly logger = new Logger(AiAnalyticsQueueProcessor.name);

    constructor(
        private readonly push: AiAnalyticsPushUseCase,
        private readonly auditSnapshot: AuditSnapshotUseCase,
        private readonly overviewJob: OverviewJobUseCase,
        /**
         * Раннер конвейера — по токену и опционально: срез конвейера
         * (AiAnalyticsPipelineModule) подключается сборкой приложения
         * отдельно, а процессор живёт в модуле фичи. Не подключён —
         * ритмовые джобы отвечают понятной ошибкой, аудит работает.
         */
        @Optional()
        @Inject(AI_ANALYTICS_SNAPSHOT_RUNNER)
        private readonly pipeline?: AiSnapshotRunner,
    ) {}

    /**
     * Обзор менеджер × тип: результат в кэш под requestKey (= jobId),
     * клиенту — только сигнал по WS (данные он заберёт повторным POST в
     * своём периметре). Ошибка уже записана error-конвертом и отправлена
     * :error внутри use-case — здесь warn + rethrow.
     */
    @Process(JobNames.SALES_AI_ANALYTICS_OVERVIEW)
    async handleOverview(job: Job<AiOverviewJobData>): Promise<void> {
        const { domain, from, to, requestKey } = job.data;
        this.logger.log(
            `SALES_AI_ANALYTICS_OVERVIEW: ${domain} ${from}..${to}`,
        );
        try {
            await this.overviewJob.execute(job.data);
        } catch (error) {
            this.logger.warn(
                `Обзор ${requestKey} упал: ${(error as Error).message}`,
            );
            throw error;
        }
    }

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
    ): Promise<AiAuditSnapshotResult | AiPipelineRunSummary> {
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
            return kind === 'audit'
                ? await this.runAudit(domain, monthKey)
                : await this.runPipeline(job);
        } catch (error) {
            this.logger.warn(
                `Снапшот ${kind} ${domain} ${monthKey} упал: ${(error as Error).message}`,
            );
            throw error;
        }
    }

    /** Месячный аудит данных (Фаза 0): живая БД → снапшот в ais. */
    private async runAudit(
        domain: string,
        monthKey: string,
    ): Promise<AiAuditSnapshotResult> {
        const result = await this.auditSnapshot.execute({ domain, monthKey });
        this.logger.log(
            `Снапшот audit ${domain} ${monthKey}: ${result.calls} звонков, ${result.analyzed} разборов`,
        );
        return result;
    }

    /** Ритм ночного конвейера: слот портала → шаги → журнал прогона. */
    private async runPipeline(
        job: Job<AiSnapshotJobData>,
    ): Promise<AiPipelineRunSummary> {
        if (!this.pipeline) {
            throw new Error(
                'Конвейер снапшотов не подключён: нет провайдера AI_ANALYTICS_SNAPSHOT_RUNNER',
            );
        }
        const result = await this.pipeline.run(job);
        this.logger.log(
            `Конвейер ${result.rhythm} ${result.domain} ${result.day}: ` +
                `${result.status}, шагов ${result.steps.length}, ${result.durationMs} мс`,
        );
        return result;
    }
}
