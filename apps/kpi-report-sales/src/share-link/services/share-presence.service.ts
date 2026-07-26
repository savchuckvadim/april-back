import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/core/redis/redis.service';

/** Живой heartbeat считается «онлайн» столько миллисекунд после ping. */
const ONLINE_TTL_MS = 45_000;

/**
 * Онлайн-присутствие и уникальные просмотры публичных ссылок.
 *
 * Эфемерное состояние — сырой Redis (НЕ AppCache: в БД писать эти
 * высокочастотные ключи не нужно). Публичная страница шлёт HTTP-heartbeat
 * через Next-прокси (WS у публики не поднимаем — бэкенд не светится).
 *
 * - Онлайн: ZSET share:online:{token}, member=viewerId, score=протухает_в
 *   (now+45с). countOnline = ZCOUNT(> now), лениво чистим протухших.
 * - Уникальные: SET share:viewers:{token} из sha256(IP+salt); SCARD = число
 *   уникальных зрителей (за всё время жизни ссылки). Приватность — храним
 *   только хэш IP.
 * TTL ключей — до протухания ссылки (передаётся в секундах).
 */
@Injectable()
export class SharePresenceService {
    private readonly salt: string;

    constructor(
        private readonly redisService: RedisService,
        config: ConfigService,
    ) {
        this.salt = config.get<string>('APP_SECRET_KEY') || 'share-presence';
    }

    private onlineKey(token: string): string {
        return `share:online:${token}`;
    }

    private viewersKey(token: string): string {
        return `share:viewers:${token}`;
    }

    /** Heartbeat зрителя: продлевает его присутствие на ONLINE_TTL. */
    async heartbeat(
        token: string,
        viewerId: string,
        ttlSeconds: number,
    ): Promise<number> {
        const client = this.redisService.getClient();
        const key = this.onlineKey(token);
        const now = Date.now();
        await client.zadd(key, String(now + ONLINE_TTL_MS), viewerId);
        await client.expire(key, Math.max(60, ttlSeconds));
        await client.zremrangebyscore(key, 0, now);
        return client.zcard(key);
    }

    /**
     * Явный выход зрителя (beacon на pagehide/скрытие вкладки) — убирает
     * его из ZSET немедленно, не дожидаясь протухания TTL (мгновенный
     * «ушёл со страницы»). Возвращает текущий онлайн.
     */
    async leave(token: string, viewerId: string): Promise<number> {
        const client = this.redisService.getClient();
        const key = this.onlineKey(token);
        await client.zrem(key, viewerId);
        await client.zremrangebyscore(key, 0, Date.now());
        return client.zcard(key);
    }

    /** Сколько зрителей сейчас онлайн (с ленивой чисткой протухших). */
    async countOnline(token: string): Promise<number> {
        const client = this.redisService.getClient();
        const key = this.onlineKey(token);
        const now = Date.now();
        await client.zremrangebyscore(key, 0, now);
        return client.zcard(key);
    }

    /**
     * Регистрирует уникального зрителя по IP (хэш). Возвращает true, если
     * IP встретился ВПЕРВЫЕ (SADD вернул 1) — для инкремента счётчика.
     */
    async registerUniqueViewer(
        token: string,
        ip: string | null,
        ttlSeconds: number,
    ): Promise<boolean> {
        if (!ip) return false;
        const client = this.redisService.getClient();
        const key = this.viewersKey(token);
        const hash = createHash('sha256')
            .update(`${ip}|${this.salt}`)
            .digest('hex')
            .slice(0, 32);
        const added = await client.sadd(key, hash);
        await client.expire(key, Math.max(60, ttlSeconds));
        return added === 1;
    }

    /** Число уникальных зрителей (по IP) за всё время жизни ссылки. */
    async countUnique(token: string): Promise<number> {
        return this.redisService.getClient().scard(this.viewersKey(token));
    }

    /** Убрать всё присутствие/уникальных ссылки (при отзыве). */
    async drop(token: string): Promise<void> {
        await this.redisService
            .getClient()
            .del(this.onlineKey(token), this.viewersKey(token));
    }
}
