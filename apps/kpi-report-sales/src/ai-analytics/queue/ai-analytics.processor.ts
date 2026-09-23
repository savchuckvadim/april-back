import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger, Optional } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { AI_ANALYTICS_SNAPSHOT_KINDS } from '../constants/ai-analytics.const';
import { AuditSnapshotUseCase } from '../domain/use-cases/audit-snapshot.use-case';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import { OverviewJobUseCase } from '../domain/use-cases/overview-job.use-case';
import { AiAnalyticsPushUseCase } from '../domain/use-cases/push.use-case';
import { AiBriefDto, AiBriefJobData } from '../dto/ai-brief.dto';
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
import { DossierJobUseCase } from '../domain/use-cases/dossier-job.use-case';
import { AiDossierDto, AiDossierJobData } from '../dto/ai-dossier.dto';

/** Тексты ошибок процессора, когда срез не подключён сборкой приложения. */
export const AI_ANALYTICS_PROCESSOR_ERRORS = {
    pipelineMissing:
        'Конвейер снапшотов не подключён: нет провайдера AI_ANALYTICS_SNAPSHOT_RUNNER',
    briefMissing: 'Срез AI-резюме не подключён: нет провайдера BriefJobUseCase',
    dossierMissing:
        'Срез досье менеджера не подключён: нет провайдера DossierJobUseCase',
} as const;

/**
 * Воркер AI-аналитики на очереди SALES_KPI_REPORT (рядом с
 * SalesFinanceQueueProcessor и остальными процессорами приложения).
 * Только dispatch по job name: расчёт и доставка push — в
 * AiAnalyticsPushUseCase (тот же код зовёт ручная ручка POST
 * ai-analytics/push), месячный снапшот аудита — в AuditSnapshotUseCase,
 * обзор (Фаза 1b) — в OverviewJobUseCase, AI-резюме (Фаза 2) — в
 * BriefJobUseCase (оба: расчёт, write-through в кэш, WS done/error).
 * Ошибка — warn + rethrow: джоба помечается failed, ретраев нет
 * (attempts: 1), повтор — следующим тиком или вручную.
 *
 * Снапшот-джоба диспетчеризуется по виду (план §5.3): `audit` — месячный
 * аудит Фазы 0, остальные виды — ритмы ночного конвейера Фазы 2
 * (у них свои опции: две попытки и таймаут 15 минут).
 *
 * Раннер конвейера и джоба резюме приходят из срезов, которые сборка
 * приложения (`ai-analytics.module.ts`) подключает отдельно, поэтому оба
 * помечены @Optional(): не подключены — джобы отвечают понятной ошибкой,
 * а не падают на старте приложения. В собранном приложении оба есть —
 * закреплено `__tests__/ai-analytics-module-di.spec.ts`.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class AiAnalyticsQueueProcessor {
    private readonly logger = new Logger(AiAnalyticsQueueProcessor.name);

    constructor(
        private readonly push: AiAnalyticsPushUseCase,
        private readonly auditSnapshot: AuditSnapshotUseCase,
        private readonly overviewJob: OverviewJobUseCase,
        @Optional()
        private readonly briefJob?: BriefJobUseCase,
        @Optional()
        private readonly dossierJob?: DossierJobUseCase,
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

    /**
     * AI-резюме периода (план §5.3): пакет фактов → модель или шаблон →
     * снапшот → кэш (6 ч) → WS done. Штатная деградация (нет ключа,
     * квота, факт-чек) — успех с шаблоном внутри use-case; ошибка модели
     * там же уходит error-конвертом и :error, здесь — warn + rethrow,
     * чтобы Bull пометил джобу failed.
     */
    @Process(JobNames.SALES_AI_ANALYTICS_BRIEF)
    async handleBrief(job: Job<AiBriefJobData>): Promise<AiBriefDto> {
        const { domain, from, to, requestKey } = job.data;
        this.logger.log(`SALES_AI_ANALYTICS_BRIEF: ${domain} ${from}..${to}`);
        try {
            if (!this.briefJob) {
                throw new Error(AI_ANALYTICS_PROCESSOR_ERRORS.briefMissing);
            }
            return await this.briefJob.execute(job.data);
        } catch (error) {
            this.logger.warn(
                `Резюме ${requestKey} упало: ${(error as Error).message}`,
            );
            throw error;
        }
    }

    /**
     * Досье менеджера (план Фазы 3, П4): окно месяцев → снапшоты и записи
     * ais → сборка → кэш → WS done. Пустой раздел — штатная деградация
     * внутри сценария; сюда доходит только провал всей джобы.
     */
    @Process(JobNames.SALES_AI_ANALYTICS_DOSSIER)
    async handleDossier(job: Job<AiDossierJobData>): Promise<AiDossierDto> {
        const { domain, managerId, requestKey } = job.data;
        this.logger.log(`SALES_AI_ANALYTICS_DOSSIER: ${domain} ${managerId}`);
        try {
            if (!this.dossierJob) {
                throw new Error(AI_ANALYTICS_PROCESSOR_ERRORS.dossierMissing);
            }
            return await this.dossierJob.execute(job.data);
        } catch (error) {
            this.logger.warn(
                `Досье ${requestKey} упало: ${(error as Error).message}`,
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
            throw new Error(AI_ANALYTICS_PROCESSOR_ERRORS.pipelineMissing);
        }
        const result = await this.pipeline.run(job);
        this.logger.log(
            `Конвейер ${result.rhythm} ${result.domain} ${result.day}: ` +
                `${result.status}, шагов ${result.steps.length}, ${result.durationMs} мс`,
        );
        return result;
    }
}
