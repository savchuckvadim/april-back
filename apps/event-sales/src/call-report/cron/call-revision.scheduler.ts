import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { envInt } from '@lib/shared';
import { CallRevisionService } from '../services/call-revision.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';

const LOCK_KEY = 'call-report:revision-lock';
const LOCK_TTL_SEC = 55 * 60;
/** 20:30 UTC = 23:30 по Москве: рабочий день закончился, разборы дневных
 * звонков конвейер уже доделал, а ночной тариф LLM ещё впереди. */
const NIGHTLY_AT_MSK_2330 = '30 20 * * *';
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_MAX_ENTITIES = 20;

/**
 * Планировщик НОЧНОГО РЕВИЗОРА (Фаза 3): раз в сутки проходит по сущностям
 * с дневными разборами и сводит картину по клиенту (CallRevisionService).
 *
 * Отдельный kill-switch CALL_REPORT_REVISOR_ENABLED=1 (по умолчанию
 * ВЫКЛЮЧЕН — ревизия удваивает LLM-расход и включается сознательно).
 * Домены — тот же ростер, что у сканера: env ∪ включённые порталы БД.
 */
@Injectable()
export class CallRevisionScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallRevisionScheduler.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
        private readonly roster: CallReportDomainRosterService,
        private readonly settingsService: CallReportSettingsService,
        private readonly revisionService: CallRevisionService,
    ) {}

    /** Стартовый лог — та же диагностика env, что у основного крона. */
    onModuleInit(): void {
        this.logger.log(
            `Ночной ревизор call-report: ${this.isEnabled() ? 'ВКЛЮЧЁН (23:30 МСК)' : 'ВЫКЛЮЧЕН (CALL_REPORT_REVISOR_ENABLED!=1)'}` +
                `, окно ${this.windowHours()} ч, лимит сущностей ${this.maxEntities()}`,
        );
    }

    @Cron(NIGHTLY_AT_MSK_2330)
    async tick(): Promise<void> {
        if (!this.isEnabled()) return;

        const domains = await this.roster.resolve();
        if (!domains.length) {
            this.logger.warn(
                'Ревизор включён, но домены не заданы ни в env, ни в настройках порталов — пропуск',
            );
            return;
        }

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
        const from = new Date(
            to.getTime() - this.windowHours() * 60 * 60 * 1000,
        );
        try {
            for (const entry of domains) {
                try {
                    const settings = await this.settingsService.resolve(
                        entry.domain,
                    );
                    if (settings.enabled === false) continue;
                    await this.revisionService.runForDomain(
                        entry.domain,
                        from,
                        to,
                        this.maxEntities(),
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

    private isEnabled(): boolean {
        return (
            this.configService.get<string>('CALL_REPORT_REVISOR_ENABLED') ===
            '1'
        );
    }

    private windowHours(): number {
        return envInt(
            this.configService.get<string>('CALL_REPORT_REVISOR_WINDOW_HOURS'),
            DEFAULT_WINDOW_HOURS,
            { min: 1 },
        );
    }

    private maxEntities(): number {
        return envInt(
            this.configService.get<string>('CALL_REPORT_REVISOR_MAX_ENTITIES'),
            DEFAULT_MAX_ENTITIES,
            { min: 1 },
        );
    }
}
