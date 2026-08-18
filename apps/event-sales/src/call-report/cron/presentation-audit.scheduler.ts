import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { PresentationAuditService } from '../services/presentation-audit.service';
import { PresentationPlanFactService } from '../services/presentation-plan-fact.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';

const LOCK_KEY = 'call-report:presentation-audit-lock';
const LOCK_TTL_SEC = 55 * 60;
/** 05:00 UTC = 08:00 МСК: до начала рабочего дня, после ночного ревизора. */
const DAILY_AT_MSK_0800 = '0 5 * * *';
/** Окно: вчерашние разборы (с запасом на ночные прогоны). */
const WINDOW_HOURS = 30;
/** Лимит презентаций за прогон — защита LLM-бюджета. */
const MAX_ENTITIES = 20;

/**
 * Планировщик УТРЕННЕЙ СВЕРКИ ПО ПРЕЗЕНТАЦИЯМ (Фаза 4): раз в сутки
 * сопоставляет отчёты менеджеров с AI-разборами презентационных звонков
 * (PresentationAuditService). Включается ИЗ АДМИНКИ per-portal: тумблер
 * «Сверка по презентациям» (portal_ai_settings, JSON
 * settings.presentationAuditEnabled; по умолчанию выключен).
 */
@Injectable()
export class PresentationAuditScheduler implements OnModuleInit {
    private readonly logger = new Logger(PresentationAuditScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly roster: CallReportDomainRosterService,
        private readonly settingsService: CallReportSettingsService,
        private readonly auditService: PresentationAuditService,
        private readonly planFactService: PresentationPlanFactService,
    ) {}

    onModuleInit(): void {
        this.logger.log(
            `Сверка по презентациям: 08:00 МСК, включается per-portal в админке ` +
                `(тумблер «Сверка по презентациям»); окно ${WINDOW_HOURS} ч, лимит ${MAX_ENTITIES}`,
        );
    }

    @Cron(DAILY_AT_MSK_0800)
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
            this.logger.warn('Предыдущая сверка ещё идёт — пропуск');
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
                    if (
                        !settings.enabled ||
                        !settings.presentationAuditEnabled
                    ) {
                        continue;
                    }
                    await this.auditService.runForDomain(
                        entry.domain,
                        from,
                        to,
                        MAX_ENTITIES,
                    );
                    // План-факт тем же тумблером: пропущенные и «отчитался
                    // без звонка» презентации — дайджест в телеграм.
                    await this.planFactService
                        .runForDomain(entry.domain, from, to)
                        .catch((error: Error) =>
                            this.logger.warn(
                                `План-факт ${entry.domain} не выполнен: ${error.message}`,
                            ),
                        );
                } catch (error) {
                    // { telegram: true } — форс-алерт админам (транспорт логгера)
                    this.logger.error(
                        `Сверка домена ${entry.domain} упала: ${(error as Error).message}`,
                        { telegram: true, domain: entry.domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }
}
