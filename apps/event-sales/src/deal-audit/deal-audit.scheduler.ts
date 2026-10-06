import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { resolveTimezoneByDomain } from '@lib/shared/lib/date';
import {
    buildDealAuditLastPeriodKey,
    DEAL_AUDIT_LOCK_KEY,
    DEAL_AUDIT_LOCK_TTL_SEC,
} from './constants/deal-audit.const';
import { hasDigestRecipients } from './lib/deal-audit-run-mode';
import { dealAuditPeriodKey, isDealAuditDue } from './lib/deal-audit-schedule';
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
 * Тик планировщика. Частота ТИКА фиксирована, а когда аудировать ПОРТАЛ —
 * решает календарь (`deal_audit_frequency`): раз в неделю в ночь на
 * понедельник или раз в месяц в ночь на первое число, по часам портала
 * (см. lib/deal-audit-schedule). Один общий крон на все порталы, каждый
 * фильтруется по метке отработанного периода — частота меняется из
 * админки без деплоя.
 */
const AUDIT_CRON = CronExpression.EVERY_30_MINUTES;

/** Метка отработанного периода живёт дольше самого длинного — месяца. */
const LAST_PERIOD_TTL_SEC = 45 * 24 * 60 * 60;

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
 * Аудит идёт ТОЛЬКО НОЧЬЮ по часам портала (решение владельца,
 * 05.10.2026): прежний «интервал от прошлого прогона» каждые сутки сползал
 * на полчаса и в итоге попадал в рабочий день — а это сотни запросов в
 * общий с менеджерами лимит Битрикса. Сводка, ушедшая ночью, ждёт
 * сотрудника утром в уведомлениях.
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
            const now = new Date();
            const tz = resolveTimezoneByDomain(domain);
            const period = dealAuditPeriodKey(now, tz, options.frequency);
            if (!force) {
                const due = isDealAuditDue({
                    now,
                    tz,
                    frequency: options.frequency,
                    lastPeriodKey: await this.lastPeriod(domain),
                });
                if (!due) return { kind: 'waiting', domain };
            }
            const result = await this.audit.runForDomain(domain, options);
            // Период закрывает и ручной прогон: крон не повторит его следом.
            await this.markPeriod(domain, period);
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
            `Аудит сделок: порталов ${outcomes.length}, все ждут своей ночи`,
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
                        frequency: options.frequency,
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

    /** Ключ периода последнего прогона портала; null — ещё не аудировался. */
    private async lastPeriod(domain: string): Promise<string | null> {
        return this.redisService
            .getClient()
            .get(buildDealAuditLastPeriodKey(domain))
            .catch(() => null);
    }

    private async markPeriod(domain: string, period: string): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                buildDealAuditLastPeriodKey(domain),
                period,
                'EX',
                LAST_PERIOD_TTL_SEC,
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
