import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { RejectReviveService } from './reject-revive.service';
import { RejectReviveOptions } from './dto/reject-revive.types';

const LOCK_KEY = 'sales-hooks:reject-revive-lock';
const LOCK_TTL_SEC = 55 * 60;
/**
 * Раз в час: счёт реанимации идёт на дни (интервал 120 дней), чаще
 * выборки отказников портала гонять незачем; перебивающая дата
 * post_fail_date — дневной гранулярности.
 */
const REVIVE_CRON = CronExpression.EVERY_HOUR;

/**
 * Планировщик реанимации отказников: обходит порталы с включённой
 * настройкой «Реанимация отказников» (админка → Settings → event-sales).
 * Паттерн общий с lead-intake-rescue: Redis-лок от наложения тиков,
 * настройки перечитываются на домен, ошибка домена не роняет цикл.
 */
@Injectable()
export class RejectReviveScheduler {
    private readonly logger = new Logger(RejectReviveScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly reviveService: RejectReviveService,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    @Cron(REVIVE_CRON)
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
                'Предыдущий тик реанимации ещё выполняется — пропуск',
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
                    if (!settings.rejectReviveEnabled) continue;

                    const options: RejectReviveOptions = {
                        intervalDays: Number(settings.rejectReviveIntervalDays),
                        assignMode:
                            settings.rejectReviveAssignMode === 'random'
                                ? 'random'
                                : 'same',
                        maxPerRun: Number(settings.rejectReviveMaxPerRun),
                        usePostFailDate: Boolean(
                            settings.rejectReviveUsePostFailDate,
                        ),
                        resendAfterMinutes: Number(
                            settings.rejectReviveResendAfterMinutes,
                        ),
                    };
                    const run = await this.reviveService.runForDomain(
                        domain,
                        options,
                    );
                    if (run.warnings.length) {
                        this.logger.warn(
                            `[reject-revive] ${domain}: ${run.warnings.join('; ')}`,
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        `Реанимация отказников ${domain} упала: ${(error as Error).message}`,
                        { telegram: true, domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /** Домены с включённой реанимацией; недоступность БД → тик пропущен. */
    private async resolveEnabledDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.eventSales,
            );
            const enabledKey =
                PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                    .rejectReviveEnabled.code;
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
