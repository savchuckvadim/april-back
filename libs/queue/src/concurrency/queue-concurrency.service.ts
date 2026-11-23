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

/**
 * Перехват СВОЕГО лока: значение подменяется, только если оно не изменилось
 * с момента чтения — иначе два перехвата одной операции прошли бы оба.
 */
const TAKE_OVER_IF_SAME_LUA =
    'if redis.call("get", KEYS[1]) == ARGV[1] then redis.call("set", KEYS[1], ARGV[2], "EX", ARGV[3]) return 1 else return 0 end';

/**
 * Метка запуска процесса: новая при каждом старте. По ней лок «остался от
 * процесса, которого больше нет» отличается от лока, который держит этот же
 * процесс и, возможно, ещё работает.
 */
const PROCESS_BOOT_ID = randomUUID();
/** Разделитель «владелец@запуск» в значении лока; в UUID его не бывает. */
const OWNER_SEPARATOR = '@';

type QueueRedis = ReturnType<RedisService['getClient']>;
/** Узкий вид eval: у ioredis перегрузки не выводятся под наши вызовы. */
type EvalOnKey = {
    eval(
        script: string,
        numKeys: number,
        key: string,
        ...args: string[]
    ): Promise<unknown>;
};

export interface QueueSlotHandle {
    /** Слот получен: джоб можно выполнять. */
    acquired: boolean;
    /** Почему не получен — для лога и решения «отложить». */
    reason?: 'entity-busy' | 'domain-full';
    /** Освободить всё захваченное. Идемпотентно. */
    release(): Promise<void>;
}

const NOOP_RELEASE = (): Promise<void> => Promise.resolve();

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
        /**
         * Кто захватывает (id операции). Задан — лок, оставшийся от ЭТОЙ ЖЕ
         * операции в процессе, которого больше нет (перезапуск посреди
         * работы), перехватывается сразу, а не ждёт своего TTL.
         */
        ownerId?: string | null;
    }): Promise<QueueSlotHandle> {
        const redis = this.safeClient();
        if (!redis) return { acquired: true, release: NOOP_RELEASE };

        const domainKey = this.domainKey(input.queue, input.domain);
        const lockKey = input.entityKey
            ? this.entityKey(input.queue, input.domain, input.entityKey)
            : null;
        // Значение — уникальный токен захвата, НЕ pid: у двух воркеров pid
        // может совпасть (реплики в контейнерах), и release одного удалял бы
        // лок другого. С владельцем — «владелец@запуск», чтобы повторная
        // доставка узнала свой лок.
        const token = input.ownerId
            ? `${input.ownerId}${OWNER_SEPARATOR}${PROCESS_BOOT_ID}`
            : randomUUID();

        try {
            /*
             * Перехват — ДО счётчика домена: место в нём уже занято оборванной
             * доставкой этой же операции, второй incr удвоил бы её, и портал
             * стоял бы с «domain-full» до истечения счётчика.
             */
            if (
                lockKey &&
                input.ownerId &&
                (await this.takeOver(redis, lockKey, input.ownerId, token))
            ) {
                const releaseDomain = this.domainReleaser(redis, domainKey);
                return {
                    acquired: true,
                    release: this.lockReleaser(
                        redis,
                        lockKey,
                        token,
                        releaseDomain,
                    ),
                };
            }

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

            const releaseDomain = this.domainReleaser(redis, domainKey);

            if (!lockKey) {
                return { acquired: true, release: releaseDomain };
            }

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
                release: this.lockReleaser(
                    redis,
                    lockKey,
                    token,
                    releaseDomain,
                ),
            };
        } catch (error) {
            this.logger.warn(
                `слот ${input.queue}/${input.domain} не проверен (${(error as Error).message}) — джоб выполняется без ограничений`,
            );
            return { acquired: true, release: NOOP_RELEASE };
        }
    }

    /**
     * Лок клиента остался от этой же операции, а процесса, который его
     * держал, уже нет (выкладка оборвала отчёт) — забираем его себе. Без
     * этого повторная доставка ждала чужого TTL (10 минут), а перекладки
     * кончались раньше, и отчёт падал с «очередь перегружена».
     *
     * НЕ перехватываем лок своего же запуска: Bull мог счесть джоб зависшим,
     * пока прошлая доставка ещё выполняется в этом процессе, — второй прогон
     * пошёл бы рядом с первым. С несколькими репликами тот же случай в
     * соседнем процессе неотличим от упавшего — это принятый компромисс
     * at-least-once.
     */
    private async takeOver(
        redis: QueueRedis,
        lockKey: string,
        ownerId: string,
        token: string,
    ): Promise<boolean> {
        const current = await redis.get(lockKey);
        if (!current) return false;
        const separatorAt = current.lastIndexOf(OWNER_SEPARATOR);
        if (separatorAt < 0) return false;
        if (current.slice(0, separatorAt) !== ownerId) return false;
        if (current.slice(separatorAt + 1) === PROCESS_BOOT_ID) return false;

        const taken = await (redis as unknown as EvalOnKey).eval(
            TAKE_OVER_IF_SAME_LUA,
            1,
            lockKey,
            current,
            token,
            String(ENTITY_LOCK_TTL_SEC),
        );
        if (Number(taken) !== 1) return false;
        this.logger.warn(
            `лок ${lockKey} остался от оборванной доставки той же операции — перехвачен`,
        );
        return true;
    }

    /** Вернуть место домена. Идемпотентно. */
    private domainReleaser(
        redis: QueueRedis,
        domainKey: string,
    ): () => Promise<void> {
        let released = false;
        return async () => {
            if (released) return;
            released = true;
            // Кламп: счётчик мог истечь по TTL посреди работы — decr из нуля
            // увёл бы его в минус и навсегда расширил лимит.
            const next = await redis.decr(domainKey).catch(() => undefined);
            if (typeof next === 'number' && next < 0) {
                await redis.del(domainKey).catch(() => undefined);
            }
        };
    }

    /**
     * Снять лок клиента и вернуть место домена. Порядок обратный захвату;
     * ошибки глушим — джоб уже выполнен, а протухшие ключи снимет TTL.
     * Удаление — только своего токена (Lua, атомарно).
     */
    private lockReleaser(
        redis: QueueRedis,
        lockKey: string,
        token: string,
        releaseDomain: () => Promise<void>,
    ): () => Promise<void> {
        return async () => {
            await (redis as unknown as EvalOnKey)
                .eval(RELEASE_IF_OWNER_LUA, 1, lockKey, token)
                .catch(() => undefined);
            await releaseDomain();
        };
    }

    private domainKey(queue: string, domain: string): string {
        return `queue:${queue}:domain:${domain}:active`;
    }

    private entityKey(queue: string, domain: string, key: string): string {
        return `queue:${queue}:lock:${domain}:${key}`;
    }

    /** Redis может быть не поднят (тесты, локальный запуск) — это не ошибка. */
    private safeClient(): QueueRedis | null {
        try {
            return this.redisService.getClient() ?? null;
        } catch {
            return null;
        }
    }
}
