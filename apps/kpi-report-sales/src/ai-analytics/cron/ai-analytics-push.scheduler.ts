import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { toPortalDate } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_PUSH_CRON,
    AI_ANALYTICS_PUSH_JOB_ID_PREFIX,
    AiAnalyticsPushKind,
} from '../constants/ai-analytics.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { AiPushJobData } from '../dto/ai-push.dto';

/** jobId push-джобы: дедуп по виду, домену и дню запуска. */
export function buildPushJobId(
    kind: AiAnalyticsPushKind,
    domain: string,
    date: string,
): string {
    return `${AI_ANALYTICS_PUSH_JOB_ID_PREFIX}:${kind}:${domain}:${date}`;
}

/**
 * Планировщик push-контура AI-аналитики: пн 08:30 МСК — повестка РОПам,
 * ежедневно 08:00 МСК — утренний разбор менеджерам. Обходит порталы со
 * строкой настроек kpiSales (AiAnalyticsPortalsLoader) и ставит джобу SALES_AI_ANALYTICS_PUSH на каждый портал с
 * ai_analytics_enabled (для дайджеста — и ai_analytics_digest_enabled).
 *
 * Сам расчёт и доставка — в процессоре (AiAnalyticsQueueProcessor), чтобы
 * Bitrix-вызовы не жили в cron-тике. jobId = ai-analytics:push:{kind}:
 * {domain}:{date} — повторный тик за тот же день джобу не задублирует;
 * второй рубеж идемпотентности — записи *_sent в ais.
 */
@Injectable()
export class AiAnalyticsPushScheduler {
    private readonly logger = new Logger(AiAnalyticsPushScheduler.name);

    constructor(
        private readonly portals: AiAnalyticsPortalsLoader,
        private readonly settings: SettingsLoader,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    @Cron(AI_ANALYTICS_PUSH_CRON.AGENDA)
    async tickAgenda(): Promise<void> {
        await this.dispatchAll('agenda');
    }

    @Cron(AI_ANALYTICS_PUSH_CRON.DIGEST)
    async tickDigest(): Promise<void> {
        await this.dispatchAll('digest');
    }

    /** Ставит джобы по всем подходящим порталам; возвращает jobId'ы. */
    async dispatchAll(
        kind: AiAnalyticsPushKind,
        now = new Date(),
    ): Promise<string[]> {
        const domains = await this.portals.listDomains();
        const jobIds: string[] = [];
        for (const domain of domains) {
            const jobId = await this.dispatchDomain(kind, domain, now);
            if (jobId) jobIds.push(jobId);
        }
        if (jobIds.length) {
            this.logger.log(
                `Push ${kind}: поставлено джоб ${jobIds.length} из ${domains.length} порталов`,
            );
        }
        return jobIds;
    }

    /** Один портал: флаги → jobId по дню в TZ портала → dispatch. Ошибка не прерывает обход. */
    private async dispatchDomain(
        kind: AiAnalyticsPushKind,
        domain: string,
        now: Date,
    ): Promise<string | null> {
        try {
            const settings = await this.settings.load(domain);
            if (!settings.enabled) return null;
            if (kind === 'digest' && !settings.digestEnabled) return null;
            if (kind === 'agenda' && !settings.ropUserIds.length) {
                this.logger.warn(
                    `Повестка ${domain}: AI-аналитика включена, но РОПы не заданы — джоба не ставится`,
                );
                return null;
            }
            const date = toPortalDate(now, settings.calendar.timeZone);
            const jobId = buildPushJobId(kind, domain, date);
            await this.dispatcher.dispatch<AiPushJobData>(
                QueueNames.SALES_KPI_REPORT,
                JobNames.SALES_AI_ANALYTICS_PUSH,
                { domain, kind, date } satisfies AiPushJobData,
                jobId,
                { attempts: 1, removeOnComplete: 500, removeOnFail: 500 },
            );
            return jobId;
        } catch (error) {
            this.logger.error(
                `Push ${kind} ${domain}: джоба не поставлена: ${(error as Error).message}`,
                { telegram: true, domain },
            );
            return null;
        }
    }
}
