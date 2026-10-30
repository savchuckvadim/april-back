import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AGENT_ANALYSIS_TYPE, AiService } from '@lib/call-lib';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    SMART_BACKFILL_DEFAULTS,
    SMART_BACKFILL_JOB_OPTIONS,
    smartBackfillJobId,
    smartBackfillLookbackWindow,
    type SmartBackfillJobData,
} from '@lib/sales-ai-analytics';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';
import { windowBounds } from '../use-cases/call-report-reanalyze.util';

/** 19:30 UTC = 22:30 МСК: дневные разборы дописаны, ночной ревизор (23:30) ещё впереди. */
const NIGHTLY_AT_MSK_2230 = '30 19 * * *';

/**
 * НОЧНОЕ ДОПИСЫВАНИЕ ПОЛЕЙ КАРТОЧЕК: раз в сутки для каждого включённого
 * портала смотрит, есть ли разборы с элементом смарта, у которых запись
 * полей не удалась (in_report = false за последние N дней), и ставит
 * джобу CALL_REPORT_SMART_BACKFILL в режиме `pending`. Нет таких записей —
 * джоба не ставится (не плодим пустые статусы).
 *
 * Тумблера нет намеренно: это механизм гарантии, что карточка рано или
 * поздно получит поля разбора, пока данные лежат в БД (инцидент
 * 13–30.10.2026: 2,5 недели пустых карточек, которые никто не заметил).
 */
@Injectable()
export class CallReportSmartBackfillScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallReportSmartBackfillScheduler.name);

    constructor(
        private readonly roster: CallReportDomainRosterService,
        private readonly settingsService: CallReportSettingsService,
        private readonly aiService: AiService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    onModuleInit(): void {
        this.logger.log(
            `Дописывание полей карточек: 22:30 МСК, окно ${SMART_BACKFILL_DEFAULTS.pendingLookbackDays} дн., ` +
                'только карточки с неудавшейся записью полей (in_report = false)',
        );
    }

    @Cron(NIGHTLY_AT_MSK_2230, { name: 'call-report-smart-backfill' })
    async tick(now: Date = new Date()): Promise<void> {
        const domains = await this.roster.resolve();
        for (const entry of domains) {
            try {
                await this.tickDomain(entry.domain, now);
            } catch (error) {
                this.logger.error(
                    `Дописывание полей ${entry.domain} не поставлено: ${(error as Error).message}`,
                    { telegram: true, domain: entry.domain },
                );
            }
        }
    }

    /** Домен: включён, есть ожидающие записи → одна джоба режима pending. */
    private async tickDomain(domain: string, now: Date): Promise<void> {
        const settings = await this.settingsService.resolve(domain);
        if (!settings.enabled) return;
        const window = smartBackfillLookbackWindow(
            now,
            SMART_BACKFILL_DEFAULTS.pendingLookbackDays,
            SMART_BACKFILL_DEFAULTS.timeZone,
        );
        const bounds = windowBounds(window.from, window.to);
        const pending = await this.aiService.findSmartWriteCandidates(
            domain,
            AGENT_ANALYSIS_TYPE,
            bounds.from,
            bounds.to,
            { pendingOnly: true },
        );
        if (!pending.length) return;

        const payload: SmartBackfillJobData = {
            domain,
            mode: 'pending',
            from: window.from,
            to: window.to,
            part: 1,
            source: 'cron',
        };
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_SMART_BACKFILL,
            payload,
            smartBackfillJobId(payload),
            SMART_BACKFILL_JOB_OPTIONS,
        );
        this.logger.warn(
            `Дописывание полей ${domain}: ${pending.length} карточек без полей разбора за ${SMART_BACKFILL_DEFAULTS.pendingLookbackDays} дн. — джоба поставлена`,
            { telegram: true, domain, count: pending.length },
        );
    }
}
