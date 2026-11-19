import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import { CALL_PAGE_REVIEW_RATE_LIMIT } from './call-page-lead.const';

/** Префикс счётчиков в Redis; ключ — хэш личного ключа, не сам ключ. */
const RATE_KEY_PREFIX = 'april:call-review-rate:';

/**
 * Частота сохранений отзыва: не больше 10 в минуту на личный ключ.
 * Счётчик — в Redis (общий для всех экземпляров приложения): INCR и срок
 * окна при первом сохранении. Ручка открыта по ссылке, и без потолка
 * зацикленная страница завалила бы таблицу ais.
 *
 * Redis недоступен — сохранение пропускается (предупреждение в лог):
 * право и ключ уже проверены, отказывать руководителю из-за кэша нельзя.
 */
@Injectable()
export class CallReviewRateLimiter {
    private readonly logger = new Logger(CallReviewRateLimiter.name);

    constructor(private readonly redis: RedisService) {}

    /** true — сохранение разрешено и учтено; false — лимит окна исчерпан. */
    async tryConsume(leadToken: string): Promise<boolean> {
        const key = `${RATE_KEY_PREFIX}${createHash('sha256')
            .update(leadToken)
            .digest('hex')
            .slice(0, 40)}`;
        const { max, windowSec } = CALL_PAGE_REVIEW_RATE_LIMIT;
        try {
            const client = this.redis.getClient();
            const count = await client.incr(key);
            // Окно ставится первым сохранением; ключ без срока (сбой между
            // INCR и EXPIRE) чинится при следующем.
            if (count === 1 || (await client.ttl(key)) < 0) {
                await client.expire(key, windowSec);
            }
            return count <= max;
        } catch (error) {
            this.logger.warn(
                `Частота отзывов не проверена: ${(error as Error).message}`,
            );
            return true;
        }
    }
}
