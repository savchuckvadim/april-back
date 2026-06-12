import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import { PbxCacheEntity } from './pbx-cache-entity.enum';

/**
 * Сервис чтения/записи общих данных портала в Redis.
 *
 * Ключ строится как `pbx-cache:{domain}:{entity}`. Значение сериализуется в JSON.
 * TTL не задаётся по умолчанию — данные хранятся бессрочно (требование: пережить
 * полное удаление контейнера за счёт volume + AOF). Инвалидация — методом invalidate.
 */
@Injectable()
export class PbxCacheService {
    private readonly logger = new Logger(PbxCacheService.name);
    private readonly prefix = 'pbx-cache';

    constructor(private readonly redisService: RedisService) {}

    private buildKey(domain: string, entity: PbxCacheEntity): string {
        return `${this.prefix}:${domain}:${entity}`;
    }

    /** Возвращает кэшированное значение сущности портала или null, если его нет. */
    async get<T>(domain: string, entity: PbxCacheEntity): Promise<T | null> {
        const raw = await this.redisService
            .getClient()
            .get(this.buildKey(domain, entity));

        if (raw === null) {
            return null;
        }

        return JSON.parse(raw) as T;
    }

    /**
     * Сохраняет значение сущности. Если ttlSeconds не передан — хранит бессрочно.
     */
    async set<T>(
        domain: string,
        entity: PbxCacheEntity,
        value: T,
        ttlSeconds?: number,
    ): Promise<void> {
        const key = this.buildKey(domain, entity);
        const payload = JSON.stringify(value);
        const client = this.redisService.getClient();

        if (ttlSeconds && ttlSeconds > 0) {
            await client.set(key, payload, 'EX', ttlSeconds);
        } else {
            await client.set(key, payload);
        }

        this.logger.debug(`Записан кэш ${key}`);
    }

    /** Удаляет кэш сущности портала. Возвращает true, если ключ существовал. */
    async invalidate(domain: string, entity: PbxCacheEntity): Promise<boolean> {
        const removed = await this.redisService
            .getClient()
            .del(this.buildKey(domain, entity));

        return removed > 0;
    }
}
