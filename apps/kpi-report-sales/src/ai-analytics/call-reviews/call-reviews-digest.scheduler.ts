import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@/core/redis/redis.service';
import { TelegramService } from '@lib/telegram';
import { previousMoscowDay } from './call-reviews-digest.window';
import { CallReviewsDigestUseCase } from './call-reviews-digest.use-case';

/** Каждый день в 09:00 по Москве — за прошлые сутки. */
export const CALL_REVIEWS_DIGEST_CRON = '0 0 9 * * *';
export const CALL_REVIEWS_DIGEST_CRON_NAME = 'ai-analytics-call-reviews-digest';
export const CALL_REVIEWS_DIGEST_TIME_ZONE = 'Europe/Moscow';

/** Замок дня: ключ + день сводки; держится дольше суток. */
const LOCK_PREFIX = 'ai-analytics:call-reviews-digest:';
const LOCK_TTL_SEC = 36 * 60 * 60;

/**
 * Ежедневная сводка отзывов руководителей о разборах звонков в общий
 * админ-чат Telegram (этап 4 техрешения 2026-11-19-call-reviews-design.md):
 * в 09:00 МСК за прошлые сутки. Замок дня в Redis (SET NX EX) — при
 * нескольких экземплярах приложения сводку шлёт один; повторный запуск в
 * тот же день ничего не шлёт. Нет отзывов ни у одного портала — не шлёт.
 *
 * Тонкий: сборка — `CallReviewsDigestUseCase`, текст — чистые функции.
 */
@Injectable()
export class CallReviewsDigestScheduler {
    private readonly logger = new Logger(CallReviewsDigestScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly digest: CallReviewsDigestUseCase,
        private readonly telegram: TelegramService,
    ) {}

    @Cron(CALL_REVIEWS_DIGEST_CRON, {
        name: CALL_REVIEWS_DIGEST_CRON_NAME,
        timeZone: CALL_REVIEWS_DIGEST_TIME_ZONE,
    })
    async tick(): Promise<void> {
        await this.run();
    }

    /** Сколько сообщений ушло (0 — не слали: замок, нет отзывов, сбой). */
    async run(now: Date = new Date()): Promise<number> {
        const { day } = previousMoscowDay(now);
        if (!(await this.lockDay(day))) return 0;
        try {
            const { parts } = await this.digest.build(now);
            if (parts === null) {
                this.logger.log(
                    `Отзывов о разборах за ${day} нет — сводку не шлём`,
                );
                return 0;
            }
            for (const part of parts) await this.telegram.sendMessage(part);
            return parts.length;
        } catch (error) {
            this.logger.error(
                `Сводка отзывов о разборах за ${day} не собрана: ${(error as Error).message}`,
                { telegram: true },
            );
            return 0;
        }
    }

    /** true — замок дня взят этим экземпляром. Redis недоступен — не шлём. */
    private async lockDay(day: string): Promise<boolean> {
        try {
            const locked = await this.redisService
                .getClient()
                .set(
                    `${LOCK_PREFIX}${day}`,
                    String(process.pid),
                    'EX',
                    LOCK_TTL_SEC,
                    'NX',
                );
            if (!locked) {
                this.logger.log(
                    `Сводка отзывов о разборах за ${day} уже отправлена`,
                );
            }
            return Boolean(locked);
        } catch (error) {
            this.logger.warn(
                `Сводка отзывов о разборах за ${day} не отправлена: Redis недоступен — ${(error as Error).message}`,
            );
            return false;
        }
    }
}
