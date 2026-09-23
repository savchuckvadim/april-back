import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    AI_ANALYTICS_MORNING_PUSH_KINDS,
    AI_ANALYTICS_PUSH_JOB_ID_PREFIX,
    AiAnalyticsPushKind,
} from '../constants/ai-analytics.const';
import {
    AI_ANALYTICS_LOCAL_HOURS,
    AI_ANALYTICS_PUSH_CRON,
    AiLocalSlot,
} from '../constants/ai-cron.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { AiPushJobData } from '../dto/ai-push.dto';
import { dueLocalClock } from './local-hour.util';

/** jobId push-джобы: дедуп по виду, домену и дню запуска. */
export function buildPushJobId(
    kind: AiAnalyticsPushKind,
    domain: string,
    date: string,
): string {
    return `${AI_ANALYTICS_PUSH_JOB_ID_PREFIX}:${kind}:${domain}:${date}`;
}

/** Слот локального времени по виду рассылки: утренние виды делят слот дайджеста. */
export const AI_ANALYTICS_PUSH_SLOTS: Readonly<
    Record<AiAnalyticsPushKind, AiLocalSlot>
> = {
    agenda: AI_ANALYTICS_LOCAL_HOURS.AGENDA,
    digest: AI_ANALYTICS_LOCAL_HOURS.DIGEST,
    digest_all: AI_ANALYTICS_LOCAL_HOURS.DIGEST,
};

/**
 * Планировщик push-контура AI-аналитики: повестка РОПам — понедельник
 * 08:30, утренний разбор менеджерам (digest) и сводный дайджест адресатам
 * из ai_analytics_digest_all_user_ids (digest_all) — ежедневно 08:00, всё
 * по ЛОКАЛЬНОМУ времени портала (Фаза 3, П10). Контейнер живёт в UTC,
 * поэтому тик ежечасный на минуте слота (:30 повестка, :00 дайджесты), а
 * по каждому порталу со строкой настроек kpiSales (AiAnalyticsPortalsLoader)
 * проверяется, наступил ли его локальный час (cron/local-hour.util.ts).
 * Джоба SALES_AI_ANALYTICS_PUSH ставится порталу с ai_analytics_enabled:
 * для digest — и ai_analytics_digest_enabled, для digest_all — непустой
 * список адресатов (от digest_enabled не зависит).
 *
 * Сам расчёт и доставка — в процессоре (AiAnalyticsQueueProcessor), чтобы
 * Bitrix-вызовы не жили в cron-тике. jobId = ai-analytics:push:{kind}:
 * {domain}:{date} по дате портала — повторный тик за тот же день джобу не
 * задублирует; второй рубеж идемпотентности — записи *_sent в ais.
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

    /** Утренний тик: личный дайджест и сводный — одним расписанием. */
    @Cron(AI_ANALYTICS_PUSH_CRON.DIGEST)
    async tickDigest(): Promise<void> {
        for (const kind of AI_ANALYTICS_MORNING_PUSH_KINDS) {
            await this.dispatchAll(kind);
        }
    }

    /** Ставит джобы порталам, у которых наступил локальный час вида; возвращает jobId'ы. */
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

    /** Один портал: локальный час → флаги → jobId по дню портала → dispatch. Ошибка не прерывает обход. */
    private async dispatchDomain(
        kind: AiAnalyticsPushKind,
        domain: string,
        now: Date,
    ): Promise<string | null> {
        try {
            const settings = await this.settings.load(domain);
            const timeZone = settings.calendar.timeZone;
            const clock = dueLocalClock(
                now,
                timeZone,
                AI_ANALYTICS_PUSH_SLOTS[kind],
            );
            if (!clock || !settings.enabled) return null;
            if (kind === 'digest' && !settings.digestEnabled) return null;
            if (kind === 'digest_all' && !settings.digestAllUserIds.length) {
                return null;
            }
            if (kind === 'agenda' && !settings.ropUserIds.length) {
                this.logger.warn(
                    `Повестка ${domain}: AI-аналитика включена, но РОПы не заданы — джоба не ставится`,
                );
                return null;
            }
            const jobId = buildPushJobId(kind, domain, clock.date);
            await this.dispatcher.dispatch<AiPushJobData>(
                QueueNames.SALES_KPI_REPORT,
                JobNames.SALES_AI_ANALYTICS_PUSH,
                { domain, kind, date: clock.date } satisfies AiPushJobData,
                jobId,
                { attempts: 1, removeOnComplete: 500, removeOnFail: 500 },
            );
            this.logger.log(
                `Push ${kind} ${domain}: локально ${clock.time} ${timeZone} → ${jobId}`,
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
