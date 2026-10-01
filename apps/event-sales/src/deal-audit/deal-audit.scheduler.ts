import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
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
import { hasDigestRecipients } from './lib/deal-audit-run-mode';
import {
    DealAuditDomainOutcome,
    DealAuditPortalMode,
    formatDealAuditRoster,
    formatDealAuditTick,
    shouldNotifyDealAuditTick,
} from './lib/deal-audit-tick-report';
import { DealAuditSettingsService } from './services/deal-audit-settings.service';
import {
    DealAuditOptions,
    DealAuditService,
} from './services/deal-audit.service';

/**
 * Тик планировщика. Частота ТИКА фиксирована, частота аудита ПОРТАЛА —
 * настройка (`deal_audit_interval_minutes`): один общий крон на все
 * порталы, каждый портал фильтруется по метке последнего прогона.
 * Так частота меняется из админки без деплоя (паттерн skap-import).
 */
const AUDIT_CRON = CronExpression.EVERY_30_MINUTES;

/** Метка последнего прогона живёт чуть дольше максимального интервала. */
const LAST_RUN_TTL_SEC = 14 * 24 * 60 * 60;

/** Режим портала из уже разобранных настроек — для отчётов крона. */
const modeOf = (options: DealAuditOptions): DealAuditPortalMode => ({
    countOnly: options.dryRun,
    hasRecipients: hasDigestRecipients(options.digest),
});

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
 *
 * Крон без работы молчит, поэтому он сам о себе рассказывает в Telegram:
 * при старте — на каких порталах включён и в каком режиме, после прогона —
 * короткий итог по каждому порталу (разбор 30.09.2026: «настроил, но не
 * работает» без этих сообщений снаружи не проверить).
 */
@Injectable()
export class DealAuditScheduler implements OnApplicationBootstrap {
    private readonly logger = new Logger(DealAuditScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly settings: DealAuditSettingsService,
        private readonly audit: DealAuditService,
    ) {}

    onApplicationBootstrap(): void {
        // Без await: чтение настроек не должно задерживать старт приложения.
        void this.reportRoster();
    }

    @Cron(AUDIT_CRON, { name: 'event-sales-deal-audit' })
    async tick(): Promise<void> {
        const domains = await this.resolveEnabledDomains();
        if (!domains) return;
        if (!domains.length) {
            this.logger.log('Аудит сделок не включён ни на одном портале');
            return;
        }

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
            const outcomes: DealAuditDomainOutcome[] = [];
            for (const domain of domains) {
                outcomes.push(await this.runDomain(domain));
            }
            this.report(outcomes);
        } finally {
            await redis.del(DEAL_AUDIT_LOCK_KEY).catch(() => undefined);
        }
    }

    /**
     * РУЧНОЙ ПРОГОН портала (ручка `POST deal-audit/run-now`): сейчас, вне
     * интервала, по настройкам портала — как прогнал бы крон. В фоне:
     * прогон по большой воронке дольше таймаута прокси, поэтому ручка
     * отвечает сразу, а итог приходит в Telegram тем же отчётом, что у
     * крона. Лок общий с кроном — прогоны не накладываются; метка
     * последнего прогона ставится, чтобы крон не повторил его следом.
     *
     * @returns false — идёт другой прогон (крон или ручной), этот не начат.
     */
    async runNow(domain: string): Promise<boolean> {
        const redis = this.redisService.getClient();
        const locked = await redis.set(
            DEAL_AUDIT_LOCK_KEY,
            String(process.pid),
            'EX',
            DEAL_AUDIT_LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) return false;

        void this.runInBackground(domain);
        return true;
    }

    /** Фон ручного прогона: итог в Telegram, лок снимается всегда. */
    private async runInBackground(domain: string): Promise<void> {
        try {
            this.report([await this.runDomain(domain, { force: true })]);
        } finally {
            await this.redisService
                .getClient()
                .del(DEAL_AUDIT_LOCK_KEY)
                .catch(() => undefined);
        }
    }

    /** Прогон портала; ошибка возвращается итогом, а не роняет цикл. */
    private async runDomain(
        domain: string,
        /** force — ручной прогон: интервал не проверяется. */
        { force = false }: { force?: boolean } = {},
    ): Promise<DealAuditDomainOutcome> {
        try {
            const options = await this.settings.resolveOptions(domain);
            if (
                !force &&
                !(await this.isDue(domain, options.intervalMinutes))
            ) {
                return { kind: 'waiting', domain };
            }
            const result = await this.audit.runForDomain(domain, options);
            await this.markRun(domain);
            return { kind: 'ran', domain, result, ...modeOf(options) };
        } catch (error) {
            const message = (error as Error).message;
            this.logger.error(`Аудит сделок ${domain} упал: ${message}`, {
                domain,
            });
            return { kind: 'failed', domain, error: message };
        }
    }

    /** Итог тика: в Telegram — только если хоть один портал прогнан. */
    private report(outcomes: readonly DealAuditDomainOutcome[]): void {
        if (shouldNotifyDealAuditTick(outcomes)) {
            this.logger.log(formatDealAuditTick(outcomes), { telegram: true });
            return;
        }
        this.logger.log(
            `Аудит сделок: порталов ${outcomes.length}, все ждут своего интервала`,
        );
    }

    /** При старте: где аудит включён и в каком режиме. */
    private async reportRoster(): Promise<void> {
        const domains = await this.resolveEnabledDomains();
        if (!domains) return;
        try {
            const entries = await Promise.all(
                domains.map(async domain => {
                    const options = await this.settings.resolveOptions(domain);
                    return {
                        domain,
                        intervalMinutes: options.intervalMinutes,
                        ...modeOf(options),
                    };
                }),
            );
            this.logger.log(formatDealAuditRoster(entries), { telegram: true });
        } catch (error) {
            this.logger.error(
                `Аудит сделок: список порталов при старте не собран: ${(error as Error).message}`,
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

    /**
     * Домены с включённым аудитом; null — БД недоступна (тик пропущен,
     * ошибка уже в Telegram). Пустой список и сбой различаются, чтобы
     * сбой не выглядел как «аудит нигде не включён».
     */
    private async resolveEnabledDomains(): Promise<string[] | null> {
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
            return null;
        }
    }
}
