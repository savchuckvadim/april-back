import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    moscowDayKey,
    parseSubmissionHash,
    submissionFields,
    type YandexSubmissionDay,
} from '../lib/yandex-submission-stats.util';

/** Префикс хэшей дня: `yandex-stt:submissions:YYYY-MM-DD` (день по Москве). */
export const YANDEX_SUBMISSIONS_KEY_PREFIX = 'yandex-stt:submissions';

/** Сколько хранится счётчик дня — четыре месяца страницы расхода. */
export const YANDEX_SUBMISSIONS_TTL_SEC = 120 * 24 * 3600;

const dayKey = (day: string): string =>
    `${YANDEX_SUBMISSIONS_KEY_PREFIX}:${day}`;

/**
 * Счётчик отправок в Яндекс по порталу и дню (Redis, без миграций БД):
 * хэш на день, у портала поля «число отправок» и «секунд». Пишет страж
 * отправок после каждой принятой Яндексом операции, читает страница
 * расхода.
 */
@Injectable()
export class YandexSubmissionStatsRepository {
    constructor(private readonly redisService: RedisService) {}

    /** Учесть одну принятую Яндексом отправку портала. */
    async record(
        domain: string,
        seconds: number,
        at: Date = new Date(),
    ): Promise<void> {
        const key = dayKey(moscowDayKey(at));
        const fields = submissionFields(domain);
        const results = await this.redisService
            .getClient()
            .multi()
            .hincrby(key, fields.count, 1)
            .hincrby(key, fields.seconds, Math.max(0, Math.round(seconds)))
            .expire(key, YANDEX_SUBMISSIONS_TTL_SEC)
            .exec();
        const failed = results?.find(([error]) => error !== null)?.[0];
        if (failed) throw failed;
    }

    /** Счётчики по дням (YYYY-MM-DD); дня без счётчика в ответе нет. */
    async byDays(
        days: readonly string[],
    ): Promise<Map<string, YandexSubmissionDay>> {
        const result = new Map<string, YandexSubmissionDay>();
        if (days.length === 0) return result;
        const pipeline = this.redisService.getClient().pipeline();
        for (const day of days) pipeline.hgetall(dayKey(day));
        const replies = (await pipeline.exec()) ?? [];
        replies.forEach(([error, hash], index) => {
            if (error) throw error;
            const fields = (hash ?? {}) as Record<string, string>;
            if (Object.keys(fields).length === 0) return;
            result.set(days[index], parseSubmissionHash(fields));
        });
        return result;
    }
}
