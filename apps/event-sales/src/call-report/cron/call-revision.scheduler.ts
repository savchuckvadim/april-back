import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { CallRevisionService } from '../services/call-revision.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';

const LOCK_KEY = 'call-report:revision-lock';
const LOCK_TTL_SEC = 55 * 60;
/** 20:30 UTC = 23:30 по Москве: рабочий день закончился, разборы дневных
 * звонков конвейер уже доделал, а ночной тариф LLM ещё впереди. */
const NIGHTLY_AT_MSK_2330 = '30 20 * * *';
/** Окно ревизии: какие разборы считаются «дневными». */
const WINDOW_HOURS = 24;
/** Лимит сущностей за прогон — защита LLM-бюджета; хвост — в следующий. */
const MAX_ENTITIES = 20;

/**
 * Планировщик НОЧНОГО РЕВИЗОРА (Фаза 3): раз в сутки проходит по сущностям
 * с дневными разборами и сводит картину по клиенту (CallRevisionService).
 *
 * Включается ИЗ АДМИНКИ per-portal: тумблер «Ночной ревизор» в настройках
 * AI портала (portal_ai_settings, JSON settings.revisorEnabled; по
 * умолчанию выключен — ревизия удваивает LLM-расход). Env-настроек нет.
 */
@Injectable()
export class CallRevisionScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallRevisionScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly roster: CallReportDomainRosterService,
        private readonly settingsService: CallReportSettingsService,
        private readonly revisionService: CallRevisionService,
    ) {}

    onModuleInit(): void {
        this.logger.log(
            `Ночной ревизор call-report: 23:30 МСК, включается per-portal в админке ` +
                `(тумблер «Ночной ревизор»); окно ${WINDOW_HOURS} ч, лимит сущностей ${MAX_ENTITIES}`,
        );
    }

    @Cron(NIGHTLY_AT_MSK_2330)
    async tick(): Promise<void> {
        const domains = await this.roster.resolve();
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
            this.logger.warn('Предыдущая ревизия ещё идёт — пропуск');
            return;
        }

        const to = new Date();
        const from = new Date(to.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
        try {
            for (const entry of domains) {
                try {
                    const settings = await this.settingsService.resolve(
                        entry.domain,
                    );
                    if (!settings.enabled || !settings.revisorEnabled) {
                        continue;
                    }
                    await this.revisionService.runForDomain(
                        entry.domain,
                        from,
                        to,
                        MAX_ENTITIES,
                    );
                } catch (error) {
                    // { telegram: true } — форс-алерт админам (транспорт логгера)
                    this.logger.error(
                        `Ревизия домена ${entry.domain} упала: ${(error as Error).message}`,
                        { telegram: true, domain: entry.domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }
}
