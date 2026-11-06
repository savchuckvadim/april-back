import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    hourlyTickCron,
    latestClosedOwnerReportPeriod,
    OWNER_REPORT_RELEASE_WORKDAY,
    ownerReportDueKinds,
    workdayOrdinalInMonth,
    type AiLocalSlot,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import {
    buildOwnerReportDeliveryJobId,
    OWNER_REPORT_DELIVERY_JOB_OPTIONS,
    type AiOwnerReportDeliveryJobData,
} from '../owner-report/owner-report-delivery.types';
import { dueLocalClock } from './local-hour.util';

/** Слот выпуска: 09:05 по TZ портала во второй рабочий день месяца. */
export const OWNER_REPORT_RELEASE_SLOT: AiLocalSlot = { hour: 9, minute: 5 };

/**
 * Крон выпуска отчёта собственнику: ежечасный тик на минуте слота; для
 * каждого портала с включённым выпуском — если наступил слот и день —
 * второй рабочий день месяца, ставит джобу выпуска по каждому виду
 * периода, который закрылся с началом месяца (месяц всегда, квартал —
 * в январе/апреле/июле/октябре и т. д.). jobId по периоду — повторный
 * тик за тот же час джобу не дублирует.
 */
@Injectable()
export class OwnerReportScheduler {
    private readonly logger = new Logger(OwnerReportScheduler.name);

    constructor(
        private readonly portals: AiAnalyticsPortalsLoader,
        private readonly settings: SettingsLoader,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    @Cron(hourlyTickCron(OWNER_REPORT_RELEASE_SLOT))
    async tick(): Promise<void> {
        await this.dispatchAll();
    }

    async dispatchAll(now = new Date()): Promise<string[]> {
        const domains = await this.portals.listDomains();
        const jobIds: string[] = [];
        for (const domain of domains) {
            jobIds.push(...(await this.dispatchDomain(domain, now)));
        }
        if (jobIds.length) {
            this.logger.log(
                `Отчёт собственнику: поставлено выпусков ${jobIds.length} по ${domains.length} порталам`,
            );
        }
        return jobIds;
    }

    private async dispatchDomain(domain: string, now: Date): Promise<string[]> {
        try {
            const settings = await this.settings.load(domain);
            if (!settings.enabled || !settings.ownerReport.enabled) return [];
            const { calendar } = settings;
            const clock = dueLocalClock(
                now,
                calendar.timeZone,
                OWNER_REPORT_RELEASE_SLOT,
            );
            if (!clock) return [];
            if (
                workdayOrdinalInMonth(clock.date, calendar) !==
                OWNER_REPORT_RELEASE_WORKDAY
            ) {
                return [];
            }
            const jobIds: string[] = [];
            for (const kind of ownerReportDueKinds(
                settings.ownerReport.kinds,
                clock.date,
            )) {
                const bounds = latestClosedOwnerReportPeriod(kind, clock.date);
                const data: AiOwnerReportDeliveryJobData = {
                    domain,
                    kind,
                    periodKey: bounds.periodKey,
                    date: clock.date,
                };
                const jobId = buildOwnerReportDeliveryJobId(data);
                await this.dispatcher.dispatch<AiOwnerReportDeliveryJobData>(
                    QueueNames.SALES_KPI_REPORT,
                    JobNames.SALES_AI_ANALYTICS_OWNER_REPORT_DELIVERY,
                    data,
                    jobId,
                    OWNER_REPORT_DELIVERY_JOB_OPTIONS,
                );
                jobIds.push(jobId);
            }
            return jobIds;
        } catch (error) {
            this.logger.error(
                `Отчёт собственнику ${domain}: выпуск не поставлен — ${(error as Error).message}`,
                { telegram: true },
            );
            return [];
        }
    }
}
