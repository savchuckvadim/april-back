import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { LeadIntakeRescueService } from './lead-intake-rescue.service';

const LOCK_KEY = 'lead-request:intake-rescue-lock';
const LOCK_TTL_SEC = 25 * 60;
/**
 * Каждые полчаса: потерянную заявку надо поднять быстро, но не ценой
 * выборки лидов портала каждые десять минут — таймер принятия у менеджера
 * всё равно стартует только с назначения.
 */
const RESCUE_CRON = CronExpression.EVERY_30_MINUTES;

/**
 * Планировщик страховки входа: обходит порталы, у которых в настройках
 * приложения «Звонки» включена «Страховка входа заявок» (админка →
 * карточка портала → Settings → event-sales).
 *
 * Паттерн общий с SLA: Redis-лок от наложения тиков, настройки
 * перечитываются на домен, ошибка одного домена не роняет цикл.
 */
@Injectable()
export class LeadIntakeRescueScheduler {
    private readonly logger = new Logger(LeadIntakeRescueScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly rescueService: LeadIntakeRescueService,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    @Cron(RESCUE_CRON)
    async tick(): Promise<void> {
        const domains = await this.resolveEnabledDomains();
        if (!domains.length) return;

        const redis = this.redisService.getClient();
        const locked = await redis.set(
            LOCK_KEY,
            String(process.pid),
            'EX',
            LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) {
            this.logger.warn(
                'Предыдущий тик страховки входа ещё выполняется — пропуск',
            );
            return;
        }

        try {
            for (const domain of domains) {
                try {
                    const settings = await this.appSettings.resolve(
                        domain,
                        EnumPortalAppCode.eventSales,
                    );
                    if (!settings.leadIntakeRescueEnabled) continue;

                    const run = await this.rescueService.runForDomain(
                        domain,
                        settings.leadIntakeRescueLookbackMinutes,
                        settings.leadIntakeRescueMaxPerRun,
                        settings.leadIntakeRescueRequestsOnly,
                    );
                    if (run.warnings.length) {
                        this.logger.warn(
                            `[intake-rescue] ${domain}: ${run.warnings.join('; ')}`,
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        `Страховка входа ${domain} упала: ${(error as Error).message}`,
                        { telegram: true, domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /** Домены с включённой страховкой; недоступность БД → no-op. */
    private async resolveEnabledDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.eventSales,
            );
            const enabledKey =
                PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                    .leadIntakeRescueEnabled.code;
            return rows
                .filter(row => row.settings[enabledKey] === true)
                .map(row => row.domain);
        } catch (error) {
            this.logger.error(
                `Порталы из portal_app_settings не прочитаны: ${(error as Error).message} — тик пропущен`,
                { telegram: true },
            );
            return [];
        }
    }
}
