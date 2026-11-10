import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    FACTS_CATCHUP_JOB_OPTIONS,
    FACTS_CATCHUP_NIGHTLY_REQUESTER,
    factsCatchupJobId,
    factsCatchupNightlyWindow,
    type FactsCatchupJobData,
} from '@lib/sales-ai-analytics';
import { resolveTimezoneByDomain } from '@lib/shared/lib/date';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';

/** 22:30 UTC = 01:30 МСК: до ночного пересчёта витрины (03:45) и после ревизора (23:30). */
const NIGHTLY_AT_MSK_0130 = '30 22 * * *';

export const FACTS_CATCHUP_NIGHTLY_CRON_NAME =
    'call-report-facts-catchup-nightly';

/**
 * НОЧНОЙ ДОГОН ФАКТОВ v3.1 (этап B6): раз в сутки для каждого портала с
 * включённым AI-конвейером и лимитом `factsCatchupNightlyBudgetRub` > 0 в
 * настройках AI ставит джобу CALL_REPORT_FACTS_CATCHUP за текущий и
 * прошлый месяц с лимитом в рублях. Расход считается по записям догона;
 * лимит достигнут — остаток ждёт следующей ночи. Итог ночи use-case шлёт
 * в Telegram. Полный переразбор — только кнопкой из админки.
 */
@Injectable()
export class CallReportFactsCatchupScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallReportFactsCatchupScheduler.name);

    constructor(
        private readonly roster: CallReportDomainRosterService,
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    onModuleInit(): void {
        this.logger.log(
            'Ночной догон фактов: 01:30 МСК, порталы с лимитом в рублях в ' +
                'настройках AI, текущий и прошлый месяц',
        );
    }

    @Cron(NIGHTLY_AT_MSK_0130, { name: FACTS_CATCHUP_NIGHTLY_CRON_NAME })
    async tick(now: Date = new Date()): Promise<void> {
        const domains = await this.roster.resolve();
        for (const entry of domains) {
            try {
                await this.tickDomain(entry.domain, now);
            } catch (error) {
                this.logger.error(
                    `Ночной догон фактов ${entry.domain} не поставлен: ${(error as Error).message}`,
                    { telegram: true, domain: entry.domain },
                );
            }
        }
    }

    /** Домен: лимит задан → одна джоба на текущий и прошлый месяц. */
    private async tickDomain(domain: string, now: Date): Promise<void> {
        const record = await this.portalAiSettings.getByDomain(domain);
        const budget = record?.factsCatchupNightlyBudgetRub ?? 0;
        if (budget <= 0) return;
        const timeZone = resolveTimezoneByDomain(domain);
        const window = factsCatchupNightlyWindow(now, timeZone);
        const payload: FactsCatchupJobData = {
            domain,
            from: window.from,
            to: window.to,
            part: 1,
            budgetRub: budget,
            timeZone,
            requestedBy: FACTS_CATCHUP_NIGHTLY_REQUESTER,
        };
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_FACTS_CATCHUP,
            payload,
            factsCatchupJobId(payload),
            FACTS_CATCHUP_JOB_OPTIONS,
        );
        this.logger.log(
            `Ночной догон фактов ${domain}: ${window.from}..${window.to}, лимит ${budget} ₽`,
        );
    }
}
