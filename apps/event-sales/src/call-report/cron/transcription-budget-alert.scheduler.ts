import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CallSource } from '@lib/core/call-context';
import { TranscriptionBudgetAlertUseCase } from '../use-cases/transcription-budget-alert.use-case';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';

/**
 * Раз в час на 19-й минуте: не совпадает с получасовыми кронами event-sales
 * (:03/:07/:13/:17/:23 и +30), часовыми (:00), разбором AI-аналитики (:10)
 * и догоном разборов (:41).
 */
export const TRANSCRIPTION_BUDGET_ALERT_CRON = '0 19 * * * *';
export const TRANSCRIPTION_BUDGET_ALERT_CRON_NAME =
    'transcription-budget-alert';

/**
 * Ежечасная проверка месячного лимита Яндекса по порталам с AI-конвейером
 * (TranscriptionBudgetAlertUseCase): дошёл до лимита — сообщение в телеграм,
 * одно за месяц. Сбой проверки одного портала остальных не останавливает.
 */
@Injectable()
export class TranscriptionBudgetAlertScheduler {
    private readonly logger = new Logger(
        TranscriptionBudgetAlertScheduler.name,
    );

    constructor(
        private readonly roster: CallReportDomainRosterService,
        private readonly alert: TranscriptionBudgetAlertUseCase,
    ) {}

    @Cron(TRANSCRIPTION_BUDGET_ALERT_CRON, {
        name: TRANSCRIPTION_BUDGET_ALERT_CRON_NAME,
    })
    @CallSource(
        `cron:${TRANSCRIPTION_BUDGET_ALERT_CRON_NAME}`,
        'Крон: бюджет распознавания',
    )
    async tick(now: Date = new Date()): Promise<void> {
        const domains = await this.roster.resolve();
        for (const entry of domains) {
            try {
                await this.alert.check(entry.domain, now);
            } catch (error) {
                this.logger.warn(
                    `Лимит Яндекса портала ${entry.domain} не проверен: ${(error as Error).message}`,
                );
            }
        }
    }
}
