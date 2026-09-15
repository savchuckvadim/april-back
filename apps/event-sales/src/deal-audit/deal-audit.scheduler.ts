import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    buildDealAuditLastRunKey,
    DEAL_AUDIT_LOCK_KEY,
    DEAL_AUDIT_LOCK_TTL_SEC,
} from './constants/deal-audit.const';
import { DealAuditSettingsService } from './services/deal-audit-settings.service';
import { DealAuditService } from './services/deal-audit.service';

/**
 * Тик планировщика. Частота ТИКА фиксирована, частота аудита ПОРТАЛА —
 * настройка (`deal_audit_interval_minutes`): один общий крон на все
 * порталы, каждый портал фильтруется по метке последнего прогона.
 * Так частота меняется из админки без деплоя (паттерн skap-import).
 */
const AUDIT_CRON = CronExpression.EVERY_30_MINUTES;

/** Метка последнего прогона живёт чуть дольше максимального интервала. */
const LAST_RUN_TTL_SEC = 14 * 24 * 60 * 60;

/**
 * Планировщик аудита сделок: обходит порталы с включённой настройкой
 * «Аудит сделок» (админка → Settings → event-sales).
 *
 * Паттерн общий с реанимацией отказников и импортом СКАП: Redis-лок от
 * наложения тиков, настройки перечитываются на домен, ошибка одного
 * домена не роняет цикл.
 *
 * Рабочее время портала НЕ проверяется намеренно: аудит никого не
 * тревожит звонком, он только размечает карточки. Сводки же удобнее
 * получать утром — этим управляет интервал, а не календарь.
 */
@Injectable()
export class DealAuditScheduler implements OnModuleInit {
    private readonly logger = new Logger(DealAuditScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly settings: DealAuditSettingsService,
        private readonly audit: DealAuditService,
    ) {}

    onModuleInit(): void {
        // Дешёвая диагностика на проде: откуда берётся конфигурация.
        this.logger.log(
            'Аудит сделок: ростер порталов — portal_app_settings ' +
                '(app=event-sales, deal_audit_enabled), тик каждые 30 минут',
        );
    }

    @Cron(AUDIT_CRON, { name: 'event-sales-deal-audit' })
    async tick(): Promise<void> {
        const domains = await this.resolveEnabledDomains();
        if (!domains.length) return;

        const redis = this.redisService.getClient();
        const locked = await redis.set(
            DEAL_AUDIT_LOCK_KEY,
            String(process.pid),
            'EX',
            DEAL_AUDIT_LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) {
            this.logger.warn('Предыдущий тик аудита ещё выполняется — пропуск');
            return;
        }

        try {
            for (const domain of domains) {
                try {
                    await this.runDomain(domain);
                } catch (error) {
                    this.logger.error(
                        `Аудит сделок ${domain} упал: ${(error as Error).message}`,
                        { telegram: true, domain },
                    );
                }
            }
        } finally {
            await redis.del(DEAL_AUDIT_LOCK_KEY).catch(() => undefined);
        }
    }

    private async runDomain(domain: string): Promise<void> {
        const options = await this.settings.resolveOptions(domain);
        if (!(await this.isDue(domain, options.intervalMinutes))) return;

        const result = await this.audit.runForDomain(domain, options);
        await this.markRun(domain);
        if (result.warnings.length) {
            this.logger.warn(
                `[deal-audit] ${domain}: ${result.warnings.join('; ')}`,
            );
        }
    }

    /** Интервал per-портал через Redis-метку последнего прогона. */
    private async isDue(
        domain: string,
        intervalMinutes: number,
    ): Promise<boolean> {
        const raw = await this.redisService
            .getClient()
            .get(buildDealAuditLastRunKey(domain))
            .catch(() => null);
        if (!raw) return true;
        const lastRunAt = Number(raw);
        if (!Number.isFinite(lastRunAt)) return true;
        return Date.now() - lastRunAt >= intervalMinutes * 60_000;
    }

    private async markRun(domain: string): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                buildDealAuditLastRunKey(domain),
                String(Date.now()),
                'EX',
                LAST_RUN_TTL_SEC,
            )
            .catch(() => undefined);
    }

    /** Домены с включённым аудитом; недоступность БД → тик пропущен. */
    private async resolveEnabledDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.eventSales,
            );
            const enabledKey =
                PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                    .dealAuditEnabled.code;
            return rows
                .filter(row => row.settings[enabledKey] === true)
                .map(row => row.domain);
        } catch (error) {
            this.logger.error(
                `Порталы из portal_app_settings не прочитаны: ${(error as Error).message} — тик аудита пропущен`,
                { telegram: true },
            );
            return [];
        }
    }
}
