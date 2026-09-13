import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { PortalWorkingHoursService } from '../working-hours/portal-working-hours.service';
import {
    XoDispatchRescueService,
    XoRescueOptions,
} from './xo-dispatch-rescue.service';

const LOCK_KEY = 'event-sales:xo-dispatch-rescue-lock';
const LOCK_TTL_SEC = 25 * 60;
/**
 * Раз в полчаса: порог досылки измеряется в минутах (по умолчанию 120), и
 * реагировать на упавший хук в пределах получаса достаточно — а чаще
 * дёргать выборки компаний и сделок портала незачем.
 */
const RESCUE_CRON = CronExpression.EVERY_30_MINUTES;

/**
 * Планировщик подстраховки ХО по компаниям и сделкам.
 *
 * Паттерн общий с реанимацией отказников и дожимом заявок: Redis-лок от
 * наложения тиков, настройки перечитываются на домен, падение одного
 * домена не роняет цикл.
 */
@Injectable()
export class XoDispatchRescueScheduler {
    private readonly logger = new Logger(XoDispatchRescueScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly rescueService: XoDispatchRescueService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly workingHours: PortalWorkingHoursService,
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
                'Предыдущий тик подстраховки ХО ещё выполняется — пропуск',
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
                    if (!settings.xoRescueEnabled) continue;
                    /*
                     * Досылка ставит клиенту ЗВОНОК и задачу живому
                     * менеджеру — вне рабочего времени портала этого делать
                     * нельзя. Потерянная работа не пропадёт: метки лежат в
                     * карточке, и её подберёт первый тик рабочего дня.
                     */
                    if (!(await this.workingHours.isWorkingTime(domain))) {
                        continue;
                    }

                    const options: XoRescueOptions = {
                        maxPerRun: Number(settings.xoRescueMaxPerRun),
                        // Порог общий со всеми ХО-кронами — одно число на
                        // всю подстраховку (решение владельца 13.09.2026).
                        resendAfterMinutes: Number(
                            settings.rejectReviveResendAfterMinutes,
                        ),
                        orphanEnabled: Boolean(settings.xoRescueOrphanEnabled),
                        orphanDryRun: Boolean(settings.xoRescueOrphanDryRun),
                        orphanLookbackHours: Number(
                            settings.xoRescueOrphanLookbackHours,
                        ),
                        orphanWorkingDays: Boolean(
                            settings.xoRescueOrphanWorkingDays,
                        ),
                    };
                    const run = await this.rescueService.runForDomain(
                        domain,
                        options,
                    );
                    if (run.warnings.length) {
                        this.logger.warn(
                            `[xo-rescue] ${domain}: ${run.warnings.join('; ')}`,
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        `Подстраховка ХО ${domain} упала: ${(error as Error).message}`,
                        { telegram: true, domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /** Домены с включённой подстраховкой; недоступность БД → тик пропущен. */
    private async resolveEnabledDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.eventSales,
            );
            const enabledKey =
                PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                    .xoRescueEnabled.code;
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
