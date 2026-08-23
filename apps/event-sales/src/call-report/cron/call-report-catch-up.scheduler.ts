import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { CallReportScanUseCase } from '../use-cases/call-report-scan.use-case';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';

const LOCK_KEY = 'call-report:catch-up-lock';
const LOCK_TTL_SEC = 110 * 60;
/** 18:00 UTC = 21:00 МСК: рабочий день закончился, записи прикреплены. */
const DAILY_AT_MSK_2100 = '0 18 * * *';
/**
 * Окно догона: заведомо шире дневного (25 ч по умолчанию) — подбирает
 * звонки, выпавшие из дневных проходов из-за лимитов, простоя или
 * задержки прикрепления записи разговора.
 */
const CATCH_UP_WINDOW_HOURS = 72;
/** Потолок постановок за один проход догона. */
const CATCH_UP_MAX_PER_RUN = 200;
/** Сколько проходов подряд делать, пока находятся новые звонки. */
const MAX_PASSES = 3;

/**
 * ВЕЧЕРНИЙ ДОГОН (Фаза 4 плана ai/tasks/call-coverage-guarantee-plan.md).
 *
 * Дневные сканы работают узким окном и с небольшим лимитом на проход —
 * этого достаточно в норме, но не после простоя, деплоя или всплеска
 * звонков. Догон раз в сутки проходит широким окном и большим лимитом,
 * повторяя проходы, пока находятся новые звонки (или до MAX_PASSES).
 *
 * Догон НЕ опционален: он и есть механизм гарантии охвата, поэтому
 * работает для каждого включённого портала (тумблера нет — тумблер на
 * гарантии означал бы её отсутствие). Дубли исключены броней 'queued' и
 * дедупом по ключу конвейера — догон использует тот же путь постановки,
 * что и обычный скан.
 */
@Injectable()
export class CallReportCatchUpScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallReportCatchUpScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly roster: CallReportDomainRosterService,
        private readonly settingsService: CallReportSettingsService,
        private readonly scanUseCase: CallReportScanUseCase,
    ) {}

    onModuleInit(): void {
        this.logger.log(
            `Догон звонков: 21:00 МСК, окно ${CATCH_UP_WINDOW_HOURS} ч, ` +
                `до ${MAX_PASSES} проходов по ${CATCH_UP_MAX_PER_RUN} звонков — ` +
                'подбирает всё, что не успели дневные сканы',
        );
    }

    @Cron(DAILY_AT_MSK_2100)
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
            this.logger.warn('Предыдущий догон ещё идёт — пропуск');
            return;
        }

        try {
            for (const entry of domains) {
                try {
                    await this.catchUpDomain(entry.domain);
                } catch (error) {
                    this.logger.error(
                        `Догон домена ${entry.domain} упал: ${(error as Error).message}`,
                        { telegram: true, domain: entry.domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /**
     * Проходы по домену, пока находятся новые звонки. Условие выхода —
     * проход, не поставивший НИЧЕГО: значит всё, что видно в окне, уже
     * обработано или занято.
     */
    private async catchUpDomain(domain: string): Promise<void> {
        const settings = await this.settingsService.resolve(domain);
        if (!settings.enabled) return;

        let totalEnqueued = 0;
        let truncated = false;
        for (let pass = 1; pass <= MAX_PASSES; pass++) {
            const result = await this.scanUseCase.execute(domain, {
                minDurationSec: settings.minDurationSec,
                windowHours: CATCH_UP_WINDOW_HOURS,
                maxPerRun: CATCH_UP_MAX_PER_RUN,
                allowedUserIds: settings.allowedUserIds ?? undefined,
                createSmartItem: settings.createSmartEnabled,
                salesOnly: settings.salesOnly,
            });
            totalEnqueued += result.enqueued;
            truncated = truncated || Boolean(result.truncated);

            this.logger.log(
                `Догон ${domain}, проход ${pass}/${MAX_PASSES}: найдено ${result.found}, ` +
                    `в очередь ${result.enqueued}, уже занято ${result.alreadyProcessed}`,
            );
            // Ничего нового — дальше проходы бессмысленны.
            if (!result.enqueued) break;
            // Проход упёрся в лимит — значит есть ещё, идём дальше.
            if (result.enqueued < CATCH_UP_MAX_PER_RUN) break;
        }

        if (totalEnqueued > 0) {
            this.logger.warn(
                `Догон ${domain}: подобрано ${totalEnqueued} звонков, не обработанных за день — ` +
                    'проверьте лимиты и интервал сканирования портала',
                { telegram: true, domain, count: totalEnqueued },
            );
        }
        if (truncated) {
            this.logger.error(
                `Догон ${domain}: выборка телефонии НЕПОЛНАЯ даже в режиме догона — ` +
                    'часть звонков не увидена, требуется сузить окно или задать список сотрудников',
                { telegram: true, domain },
            );
        }
    }
}
