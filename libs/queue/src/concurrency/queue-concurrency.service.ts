import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/**
 * Сериализация и шардирование параллельных джобов.
 *
 * Задача: поднять concurrency воркеров, не поймав две беды сразу.
 *  1. ГОНКА ПО КЛИЕНТУ. Два отчёта по одному клиенту одновременно ищут
 *     «текущую основную сделку» — и оба могут её создать (дубль), а
 *     batch-записи полей перемешаются. Лечится локом на ключ клиента:
 *     разные клиенты идут параллельно, один клиент — строго по очереди.
 *  2. ЖИРНЫЙ ПОРТАЛ. Один домен с очередью из сотни отчётов иначе выест
 *     весь concurrency, и остальные порталы будут ждать его. Лечится
 *     счётчиком одновременных джобов НА ДОМЕН.
 *
 * Оба примитива — в Redis: воркеров может быть несколько реплик, память
 * процесса тут не поможет. Redis недоступен — работаем как раньше
 * (последовательно и без шардирования), а не падаем: очередь важнее
 * оптимизации.
 */

/**
 * Клиентский лок: TTL с запасом на самый долгий отчёт (штатный — секунды).
 * Отчёт ДОЛЬШЕ TTL — аномалия: лок истечёт и сериализация на этого клиента
 * временно снимется; владельческий токен ниже гарантирует, что хотя бы
 * release такого «пережившего» джоба не удалит чужой свежий лок.
 */
const ENTITY_LOCK_TTL_SEC = 600;
/** Слот домена живёт не дольше лока — иначе счётчик «протечёт» вверх. */
const DOMAIN_SLOT_TTL_SEC = ENTITY_LOCK_TTL_SEC;

/**
 * Удаление лока ТОЛЬКО владельцем: сравнение и del атомарно, иначе release
 * джоба, пережившего TTL, снёс бы лок, уже захваченный следующим джобом.
 */
const RELEASE_IF_OWNER_LUA =
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export interface QueueSlotHandle {
    /** Слот получен: джоб можно выполнять. */
    acquired: boolean;
    /** Почему не получен — для лога и решения «отложить». */
    reason?: 'entity-busy' | 'domain-full';
    /** Освободить всё захваченное. Идемпотентно. */
    release(): Promise<void>;
}

const NOOP_RELEASE = async (): Promise<void> => undefined;

@Injectable()
export class QueueConcurrencyService {
    private readonly logger = new Logger(QueueConcurrencyService.name);

    constructor(private readonly redisService: RedisService) {}

    /**
     * Занять слот на выполнение джоба: сначала домен (дешевле отсеять),
     * потом клиента. Не удалось — вернётся `acquired: false`, и вызывающий
     * ОБЯЗАН переложить джоб с задержкой, а не выполнять его.
     */
    async acquire(input: {
        queue: string;
        domain: string;
        /** Ключ клиента: `${entityType}:${entityId}`. Пусто — только домен. */
        entityKey?: string | null;
        /** Сколько джобов домена выполнять одновременно. */
        maxPerDomain: number;
    }): Promise<QueueSlotHandle> {
        const redis = this.safeClient();
        if (!redis) return { acquired: true, release: NOOP_RELEASE };

        const domainKey = this.domainKey(input.queue, input.domain);
        const released = { done: false };

        try {
            const active = await redis.incr(domainKey);
            /*
             * TTL — только СВЕЖЕМУ ключу (находка ревью): переармирование на
             * каждом acquire означало бы, что утёкший после падения воркера
             * счётчик никогда не умрёт — retry-цикл перекладок сам продлевал
             * бы ему жизнь каждые 3 секунды. Цена: у долго занятого домена
             * TTL может истечь посреди работы и счётчик обнулится — это
             * деградация в сторону «пропустить», а не «заклинить», release
             * ниже клампует уход в минус.
             */
            if (active === 1) {
                await redis.expire(domainKey, DOMAIN_SLOT_TTL_SEC);
            }
            if (active > input.maxPerDomain) {
                await redis.decr(domainKey).catch(() => undefined);
                return {
                    acquired: false,
                    reason: 'domain-full',
                    release: NOOP_RELEASE,
                };
            }

            const releaseDomain = async (): Promise<void> => {
                if (released.done) return;
                released.done = true;
                // Кламп: счётчик мог истечь по TTL посреди работы — decr
                // из нуля увёл бы его в минус и навсегда расширил лимит.
                const next = await redis.decr(domainKey).catch(() => undefined);
                if (typeof next === 'number' && next < 0) {
                    await redis.del(domainKey).catch(() => undefined);
                }
            };

            if (!input.entityKey) {
                return { acquired: true, release: releaseDomain };
            }

            const lockKey = this.entityKey(
                input.queue,
                input.domain,
                input.entityKey,
            );
            // Значение — уникальный токен захвата, НЕ pid: у двух воркеров
            // pid может совпасть (реплики в контейнерах), и release одного
            // удалял бы лок другого.
            const token = randomUUID();
            const locked = await redis.set(
                lockKey,
                token,
                'EX',
                ENTITY_LOCK_TTL_SEC,
                'NX',
            );
            if (!locked) {
                await releaseDomain();
                return {
                    acquired: false,
                    reason: 'entity-busy',
                    release: NOOP_RELEASE,
                };
            }

            return {
                acquired: true,
                release: async () => {
                    // Порядок обратный захвату; ошибки глушим — джоб уже
                    // выполнен, а протухшие ключи снимет TTL. Удаление —
                    // только своего токена (Lua, атомарно).
                    await (
                        redis as unknown as {
                            eval(
                                script: string,
                                numKeys: number,
                                key: string,
                                arg: string,
                            ): Promise<unknown>;
                        }
                    )
                        .eval(RELEASE_IF_OWNER_LUA, 1, lockKey, token)
                        .catch(() => undefined);
                    await releaseDomain();
                },
            };
        } catch (error) {
            this.logger.warn(
                `слот ${input.queue}/${input.domain} не проверен (${(error as Error).message}) — джоб выполняется без ограничений`,
            );
            return { acquired: true, release: NOOP_RELEASE };
        }
    }

    private domainKey(queue: string, domain: string): string {
        return `queue:${queue}:domain:${domain}:active`;
    }

    private entityKey(queue: string, domain: string, key: string): string {
        return `queue:${queue}:lock:${domain}:${key}`;
    }

    /** Redis может быть не поднят (тесты, локальный запуск) — это не ошибка. */
    private safeClient(): ReturnType<RedisService['getClient']> | null {
        try {
            return this.redisService.getClient() ?? null;
        } catch {
            return null;
        }
    }
}
