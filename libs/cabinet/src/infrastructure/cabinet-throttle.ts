import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

const KEY_PREFIX = 'cabinet:throttle:';

/**
 * Счётчик попыток в Redis (вход, сброс пароля, коды Telegram): защищает
 * от перебора паролей и от спама письмами. Окно — с первой попытки.
 *
 * Redis недоступен — не блокируем: лимит вспомогательный, а пароль и
 * одноразовые токены проверяются отдельно. Счётчик общий для всех
 * реплик приложения (Redis один), зеркалам не мешает.
 */
@Injectable()
export class CabinetThrottle {
    private readonly logger = new Logger(CabinetThrottle.name);

    constructor(private readonly redisService: RedisService) {}

    /** @throws HttpException 429, если попыток больше `limit` за окно */
    async hit(
        key: string,
        limit: number,
        windowSeconds: number,
        message: string,
    ): Promise<void> {
        let attempts: number;
        try {
            const redis = this.redisService.getClient();
            const fullKey = `${KEY_PREFIX}${key}`;
            attempts = await redis.incr(fullKey);
            if (attempts === 1) {
                await redis.expire(fullKey, windowSeconds);
            }
        } catch (error) {
            this.logger.warn(
                `Счётчик попыток недоступен (${key}): ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return;
        }
        if (attempts > limit) {
            throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    /** Успешное действие обнуляет счётчик (вход по верному паролю). */
    async reset(key: string): Promise<void> {
        try {
            await this.redisService.getClient().del(`${KEY_PREFIX}${key}`);
        } catch {
            // счётчик сам истечёт по TTL
        }
    }
}
