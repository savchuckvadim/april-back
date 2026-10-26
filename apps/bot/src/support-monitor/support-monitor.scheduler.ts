import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
    SupportMonitorSettingsService,
    SupportMonitorStore,
    SupportMonitorTickService,
    SupportTelegramNotifier,
} from '@lib/support';
import {
    formatSupportRoster,
    SupportRosterEntry,
} from './support-monitor-roster';

/** Имя крона — в отчёте кронов и в режиме ожидания (standby). */
export const SUPPORT_MONITOR_CRON_NAME = 'bot-support-monitor';

/**
 * Крон мониторинга линии поддержки (план 26.10.2026).
 *
 * Тик — раз в минуту, а как часто смотреть линию, решает настройка портала
 * `support_monitor_poll_minutes` (окно в Redis): частота меняется из
 * админки без деплоя. Redis-лок — один процесс на кластер; ошибка одного
 * портала не роняет остальные и тревожит разработчика не чаще раза в час.
 * На зеркале (APP_ROLE=standby) кроны останавливает bootstrapApp.
 */
@Injectable()
export class SupportMonitorScheduler implements OnApplicationBootstrap {
    private readonly logger = new Logger(SupportMonitorScheduler.name);

    constructor(
        private readonly settings: SupportMonitorSettingsService,
        private readonly tickService: SupportMonitorTickService,
        private readonly store: SupportMonitorStore,
        private readonly telegram: SupportTelegramNotifier,
    ) {}

    onApplicationBootstrap(): void {
        // Без await: чтение настроек не должно задерживать старт приложения.
        void this.reportRoster();
    }

    @Cron(CronExpression.EVERY_MINUTE, { name: SUPPORT_MONITOR_CRON_NAME })
    async tick(): Promise<void> {
        const domains = await this.enabledDomains();
        if (!domains?.length) return;
        if (!(await this.store.acquireLock())) {
            this.logger.debug('Мониторинг поддержки: предыдущий тик ещё идёт');
            return;
        }
        try {
            for (const domain of domains) {
                await this.runDomain(domain);
            }
        } finally {
            await this.store.releaseLock();
        }
    }

    /** Просмотр линии портала, если пришло его время; сбой — тревога. */
    private async runDomain(domain: string): Promise<void> {
        try {
            const options = await this.settings.resolveOptions(domain);
            if (!options.enabled) return;
            if (!(await this.store.claimPoll(domain, options.pollMinutes))) {
                return;
            }
            await this.tickService.run(domain, options);
        } catch (error) {
            const message = `Мониторинг поддержки ${domain}: просмотр линии не удался — ${(error as Error).message}. Следующий просмотр попробует снова.`;
            const alert = await this.store.allowAlert(domain);
            this.logger.error(message, alert ? { telegram: true } : {});
        }
    }

    /**
     * Порталы с включённым монитором; null — настройки не прочитаны
     * (БД недоступна), тик пропущен.
     */
    private async enabledDomains(): Promise<string[] | null> {
        try {
            return await this.settings.listEnabledDomains();
        } catch (error) {
            this.logger.error(
                `Мониторинг поддержки: настройки порталов не прочитаны — ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** При старте: где монитор включён и в каком режиме. */
    private async reportRoster(): Promise<void> {
        const domains = await this.enabledDomains();
        if (!domains?.length) return;
        try {
            const entries: SupportRosterEntry[] = await Promise.all(
                domains.map(async domain => ({
                    domain,
                    options: await this.settings.resolveOptions(domain),
                })),
            );
            this.logger.log(
                formatSupportRoster(entries, this.telegram.isConfigured()),
                { telegram: true },
            );
        } catch (error) {
            this.logger.error(
                `Мониторинг поддержки: список порталов при старте не собран — ${(error as Error).message}`,
            );
        }
    }
}
