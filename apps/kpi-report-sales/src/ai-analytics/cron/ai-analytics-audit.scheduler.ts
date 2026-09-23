import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX,
    AiAnalyticsSnapshotKind,
} from '../constants/ai-analytics.const';
import {
    AI_ANALYTICS_AUDIT_CRON,
    AI_ANALYTICS_LOCAL_HOURS,
} from '../constants/ai-cron.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { AiSnapshotJobData } from '../dto/ai-snapshot.dto';
import { dueLocalClock } from './local-hour.util';

/** jobId снапшот-джобы: дедуп по виду, домену и месяцу запуска. */
export function buildSnapshotJobId(
    kind: AiAnalyticsSnapshotKind,
    domain: string,
    monthKey: string,
): string {
    return `${AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX}:${kind}:${domain}:${monthKey}`;
}

/**
 * Планировщик месячного аудита данных AI-аналитики: 1-го числа 04:10 по
 * ЛОКАЛЬНОМУ времени портала (Фаза 3, П10; следом за снимком планов
 * 04:00). Тик ежечасный на :10; по каждому порталу с признаком
 * ai_analytics_audit_enabled, у которого наступил его локальный час
 * (cron/local-hour.util.ts), ставится джоба SALES_AI_ANALYTICS_SNAPSHOT
 * (kind = audit) в очередь SALES_KPI_REPORT. Сам расчёт — в процессоре
 * (AuditSnapshotUseCase → runAiAnalyticsAudit по живой БД, снапшот в ais
 * с source = cron), чтобы тяжёлая выборка не жила в cron-тике.
 * jobId = ai-analytics:snapshot:audit:{domain}:{YYYY-MM} по месяцу портала
 * — повторный тик за тот же месяц джобу не задублирует.
 */
@Injectable()
export class AiAnalyticsAuditScheduler {
    private readonly logger = new Logger(AiAnalyticsAuditScheduler.name);

    constructor(
        private readonly portals: AiAnalyticsPortalsLoader,
        private readonly settings: SettingsLoader,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    @Cron(AI_ANALYTICS_AUDIT_CRON)
    async tick(): Promise<void> {
        await this.dispatchAll();
    }

    /** Ставит джобы порталам, у которых наступил локальный час аудита; возвращает jobId'ы. */
    async dispatchAll(now = new Date()): Promise<string[]> {
        const domains = await this.portals.listDomains();
        const jobIds: string[] = [];
        for (const domain of domains) {
            const jobId = await this.dispatchDomain(domain, now);
            if (jobId) jobIds.push(jobId);
        }
        if (jobIds.length) {
            this.logger.log(
                `Аудит: поставлено джоб ${jobIds.length} из ${domains.length} порталов`,
            );
        }
        return jobIds;
    }

    /** Один портал: локальный час → флаг → jobId по месяцу портала → dispatch. Ошибка не прерывает обход. */
    private async dispatchDomain(
        domain: string,
        now: Date,
    ): Promise<string | null> {
        try {
            const settings = await this.settings.load(domain);
            const timeZone = settings.calendar.timeZone;
            const clock = dueLocalClock(
                now,
                timeZone,
                AI_ANALYTICS_LOCAL_HOURS.AUDIT,
            );
            // Признак аудита независим от ai_analytics_enabled: аудит
            // делается ДО включения витрины (Фаза 0).
            if (!clock || !settings.auditEnabled) return null;
            // Месяц запуска — по дате портала (YYYY-MM из YYYY-MM-DD).
            const monthKey = clock.date.slice(0, 7);
            const jobId = buildSnapshotJobId('audit', domain, monthKey);
            await this.dispatcher.dispatch<AiSnapshotJobData>(
                QueueNames.SALES_KPI_REPORT,
                JobNames.SALES_AI_ANALYTICS_SNAPSHOT,
                { domain, kind: 'audit', monthKey } satisfies AiSnapshotJobData,
                jobId,
                { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
            );
            this.logger.log(
                `Аудит ${domain}: локально ${clock.time} ${timeZone} → ${jobId}`,
            );
            return jobId;
        } catch (error) {
            this.logger.error(
                `Аудит ${domain}: джоба не поставлена: ${(error as Error).message}`,
                { telegram: true, domain },
            );
            return null;
        }
    }
}
