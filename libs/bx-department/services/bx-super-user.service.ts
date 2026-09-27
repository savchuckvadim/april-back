import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '@lib/core/redis/redis.service';
import { VendorSuperUserRepository } from '../repositories/vendor-super-user.repository';

/**
 * Суперпользователь вендора (сотрудник April) на портале клиента.
 *
 * Источник правды — таблица `vendor_super_users` (админка April, карточка
 * портала). Раньше список задавался env `BX_SUPER_USER_IDS` в формате
 * `domain:id[,domain:id...]`; переменная снята — доступ вендора нельзя было
 * менять без перезапуска, и он не был виден в интерфейсе.
 *
 * Что даёт признак — решают потребители: структура отделов отдаёт
 * суперпользователю видимость all (headOfSource = superuser), доступ
 * ai-analytics — роль cup без чтения структуры.
 *
 * Горячий путь: зовётся на каждый расчёт роли, поэтому список домена
 * кэшируется в Redis на {@link CACHE_TTL_SECONDS} (как в настройках
 * портала). Админка сбрасывает ключ через {@link invalidate} — снятый
 * доступ не должен доживать TTL. Ошибка Redis не роняет проверку: читаем
 * напрямую из БД.
 *
 * Отказ в безопасную сторону: если БД недоступна, суперпользователей нет —
 * лишних прав никто не получает.
 */
const CACHE_TTL_SECONDS = 300;
const CACHE_PREFIX = 'vendor-super-users';

@Injectable()
export class BxSuperUserService {
    private readonly logger = new Logger(BxSuperUserService.name);
    private readonly redis: Redis;

    constructor(
        private readonly repository: VendorSuperUserRepository,
        redisService: RedisService,
    ) {
        this.redis = redisService.getClient();
    }

    /** Суперпользователь ли `userId` на портале `domain` (id ≤ 0 — нет). */
    async isSuperUser(domain: string, userId: number): Promise<boolean> {
        if (!Number.isInteger(userId) || userId <= 0) return false;
        const key = this.normalizeDomain(domain);
        if (!key) return false;
        const ids = await this.activeIdsOf(key);
        return ids.includes(userId);
    }

    /** Сбросить кэш домена — после правок в админке. */
    async invalidate(domain: string): Promise<void> {
        const key = this.normalizeDomain(domain);
        if (!key) return;
        await this.redis.del(this.cacheKey(key)).catch(() => undefined);
    }

    /** Активные Bitrix-id домена: из кэша, иначе из БД. */
    private async activeIdsOf(domain: string): Promise<number[]> {
        const cacheKey = this.cacheKey(domain);
        const cached = await this.redis.get(cacheKey).catch(() => null);
        const parsed = cached === null ? null : this.parseCached(cached);
        if (parsed) return parsed;

        let ids: number[];
        try {
            ids = await this.repository.findActiveBitrixIdsByDomain(domain);
        } catch (error) {
            // Отказ в безопасную сторону: без БД суперпользователей нет.
            this.logger.error(
                `Не прочитать суперпользователей домена ${domain}: ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
            return [];
        }

        await this.redis
            .set(cacheKey, JSON.stringify(ids), 'EX', CACHE_TTL_SECONDS)
            .catch(() => undefined);
        return ids;
    }

    /** Кэш мог быть записан кем угодно — мусор не роняет проверку. */
    private parseCached(raw: string): number[] | null {
        try {
            const value: unknown = JSON.parse(raw);
            if (!Array.isArray(value)) return null;
            return value.filter(
                (id): id is number => Number.isInteger(id) && (id as number) > 0,
            );
        } catch {
            return null;
        }
    }

    /** Ключ домена: без пробелов по краям и в нижнем регистре. */
    private normalizeDomain(domain: string): string {
        return String(domain ?? '')
            .trim()
            .toLowerCase();
    }

    private cacheKey(domain: string): string {
        return `${CACHE_PREFIX}:${domain}`;
    }
}
