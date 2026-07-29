import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '@/core/prisma';
import { RedisService } from '@/core/redis/redis.service';
import { Prisma, AppCache } from 'generated/prisma';
import {
    buildAppCacheRedisKey,
    buildAppCacheRedisPattern,
} from '../lib/cache-key.util';
import {
    AppCacheEntryDto,
    AppCacheItemDto,
    AppCacheListRequestDto,
    AppCacheListResponseDto,
    AppCacheResetRequestDto,
    AppCacheResetResponseDto,
    AppCacheSetResponseDto,
} from '../dto/app-cache.dto';

/** Адрес записи кэша (программный API, зеркалит AppCacheRefDto). */
export interface AppCacheRef {
    app: string;
    domain: string;
    key: string;
    /** 0/не указан — портальный кэш, общий для всех пользователей. */
    bxUserId?: number;
}

export interface AppCacheSetOptions extends AppCacheRef {
    data: unknown;
    /** Не указан — бессрочно (строка в БД без expired_at). */
    ttlSeconds?: number;
    group?: string;
    meta?: Record<string, unknown>;
    tags?: string[];
}

/**
 * Центральный кэш монорепы: write-through Redis + MySQL (таблица app_cache).
 *
 * Смысл: Redis — горячий слой, БД — источник истины. Записываем всегда в оба;
 * читаем из Redis, а на промахе (например, Redis был перезагружен) поднимаем
 * запись из БД и регидрируем Redis. Протухание — по expired_at: в Redis через
 * TTL ключа, в БД — проверкой при чтении + почасовой чисткой.
 *
 * Ключ записи логический: app (пространство фичи) + домен портала + key
 * (+ bxUserId для пользовательского кэша). В БД уникальность держит
 * app_cache_lookup_unique (portal_id, app, key, bx_user_id).
 *
 * Хранить можно что угодно сериализуемое в JSON. Модуль глобальный —
 * подключается один раз в root-модуль приложения (см. app-cache.module.ts).
 */
@Injectable()
export class AppCacheService {
    private readonly logger = new Logger(AppCacheService.name);

    /** Redis-TTL для бессрочных записей: истёк — поднимем из БД заново. */
    private static readonly REHYDRATE_TTL_SEC = 6 * 3600;

    private static readonly LIST_MAX_TAKE = 200;

    /** domain → portals.id; портал не меняет id, кэшируем на весь аптайм. */
    private readonly portalIdByDomain = new Map<string, bigint>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    // ─────────────────────────── программный API ───────────────────────────

    /** Достаёт значение: Redis → (на промахе) БД с регидрацией Redis. */
    async get<T>(ref: AppCacheRef): Promise<T | null> {
        const redisKey = this.redisKeyOf(ref);
        const raw = await this.redisService.getClient().get(redisKey);
        if (raw !== null) {
            try {
                return JSON.parse(raw) as T;
            } catch {
                this.logger.warn(
                    `Повреждённый JSON в Redis ${redisKey} — читаю из БД`,
                );
            }
        }

        const row = await this.findRow(ref);
        if (!row) return null;

        if (this.isExpired(row)) {
            await this.deleteRow(row);
            return null;
        }

        const ttl = this.remainingTtlSec(row);
        await this.redisService
            .getClient()
            .set(redisKey, JSON.stringify(row.data), 'EX', ttl);
        this.logger.debug(
            `Регидрация из БД → Redis: ${redisKey} (TTL ${ttl}s)`,
        );

        return row.data as T;
    }

    /** Пишет значение в БД (upsert) и Redis. */
    async set(opts: AppCacheSetOptions): Promise<AppCacheSetResponseDto> {
        const portalId = await this.requirePortalId(opts.domain);
        const bxUserId = BigInt(opts.bxUserId ?? 0);
        const serialized = JSON.stringify(opts.data);
        const checksum = createHash('md5').update(serialized).digest('hex');
        const expiredAt = opts.ttlSeconds
            ? new Date(Date.now() + opts.ttlSeconds * 1000)
            : null;

        const values = {
            domain: opts.domain,
            group: opts.group ?? null,
            data: opts.data as Prisma.InputJsonValue,
            meta: (opts.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            tags: (opts.tags ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            checksum,
            expiredAt,
        };

        const row = await this.prisma.appCache.upsert({
            where: {
                portalId_app_key_bxUserId: {
                    portalId,
                    app: opts.app,
                    key: opts.key,
                    bxUserId,
                },
            },
            create: {
                id: randomUUID(),
                app: opts.app,
                portalId,
                bxUserId,
                key: opts.key,
                ...values,
            },
            update: values,
        });

        const ttl = opts.ttlSeconds ?? AppCacheService.REHYDRATE_TTL_SEC;
        await this.redisService
            .getClient()
            .set(this.redisKeyOf(opts), serialized, 'EX', ttl);

        return {
            id: row.id,
            checksum,
            expiredAt: expiredAt ? expiredAt.toISOString() : null,
        };
    }

    /**
     * Laravel-style «запомнить»: вернуть из кэша, а на промахе — вычислить
     * фабрикой, положить и вернуть. Удобен для миграции существующих кэшей.
     */
    async remember<T>(
        opts: Omit<AppCacheSetOptions, 'data'>,
        factory: () => Promise<T>,
    ): Promise<T> {
        const cached = await this.get<T>(opts);
        if (cached !== null) return cached;

        const data = await factory();
        await this.set({ ...opts, data });
        return data;
    }

    /**
     * Пакетное чтение (порядок результата = порядку refs, промах → null).
     *
     * Redis — одним MGET; промахи добираются из БД группированными
     * findMany (по одной выборке на пару портал+app) и регидрируются в
     * Redis pipeline'ом. Протухшие строки БД пропускаются (их удалит
     * почасовой purgeExpired). Нужен потребителям с сотнями мелких ячеек
     * (например месячные ячейки airtime) — поштучный get там дал бы сотни
     * roundtrip'ов.
     */
    async getMany<T>(refs: AppCacheRef[]): Promise<(T | null)[]> {
        if (!refs.length) return [];
        const client = this.redisService.getClient();

        const raw = await client.mget(...refs.map(ref => this.redisKeyOf(ref)));
        const results: (T | null)[] = new Array<T | null>(refs.length).fill(
            null,
        );
        const missIndexes: number[] = [];
        raw.forEach((value, i) => {
            if (value === null) {
                missIndexes.push(i);
                return;
            }
            try {
                results[i] = JSON.parse(value) as T;
            } catch {
                missIndexes.push(i);
            }
        });
        if (!missIndexes.length) return results;

        // Группируем промахи по (portalId, app, bxUserId) → по одному
        // findMany с key IN (...) на группу; обычно группа одна.
        const groups = new Map<
            string,
            { where: Prisma.AppCacheWhereInput; indexes: number[] }
        >();
        for (const i of missIndexes) {
            const ref = refs[i];
            const portalId = await this.resolvePortalId(ref.domain);
            if (portalId === null) continue;
            const bxUserId = BigInt(ref.bxUserId ?? 0);
            const groupKey = `${portalId}|${ref.app}|${bxUserId}`;
            let group = groups.get(groupKey);
            if (!group) {
                group = {
                    where: {
                        portalId,
                        app: ref.app,
                        bxUserId,
                        key: { in: [] },
                    },
                    indexes: [],
                };
                groups.set(groupKey, group);
            }
            (group.where.key as { in: string[] }).in.push(ref.key);
            group.indexes.push(i);
        }

        const pipeline = client.pipeline();
        let rehydrated = 0;
        for (const group of groups.values()) {
            const rows = await this.prisma.appCache.findMany({
                where: group.where,
            });
            const byKey = new Map(rows.map(row => [row.key, row]));
            for (const i of group.indexes) {
                const row = byKey.get(refs[i].key);
                if (!row || this.isExpired(row)) continue;
                results[i] = row.data as T;
                pipeline.set(
                    this.redisKeyOf(refs[i]),
                    JSON.stringify(row.data),
                    'EX',
                    this.remainingTtlSec(row),
                );
                rehydrated += 1;
            }
        }
        if (rehydrated > 0) {
            await pipeline.exec();
            this.logger.debug(
                `getMany: регидрация из БД → Redis, ключей: ${rehydrated}`,
            );
        }
        return results;
    }

    /**
     * Пакетная запись: upsert'ы одной prisma-транзакцией + Redis pipeline.
     * Семантика каждой записи идентична set(); для потоков мелких ячеек
     * (airtime-месяцы) экономит N-1 roundtrip'ов в БД и Redis.
     */
    async setMany(entries: AppCacheSetOptions[]): Promise<void> {
        if (!entries.length) return;
        const client = this.redisService.getClient();
        const pipeline = client.pipeline();
        const ops: Prisma.PrismaPromise<unknown>[] = [];

        for (const opts of entries) {
            const portalId = await this.requirePortalId(opts.domain);
            const bxUserId = BigInt(opts.bxUserId ?? 0);
            const serialized = JSON.stringify(opts.data);
            const checksum = createHash('md5').update(serialized).digest('hex');
            const expiredAt = opts.ttlSeconds
                ? new Date(Date.now() + opts.ttlSeconds * 1000)
                : null;

            const values = {
                domain: opts.domain,
                group: opts.group ?? null,
                data: opts.data as Prisma.InputJsonValue,
                meta: (opts.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                tags: (opts.tags ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                checksum,
                expiredAt,
            };
            ops.push(
                this.prisma.appCache.upsert({
                    where: {
                        portalId_app_key_bxUserId: {
                            portalId,
                            app: opts.app,
                            key: opts.key,
                            bxUserId,
                        },
                    },
                    create: {
                        id: randomUUID(),
                        app: opts.app,
                        portalId,
                        bxUserId,
                        key: opts.key,
                        ...values,
                    },
                    update: values,
                }),
            );
            pipeline.set(
                this.redisKeyOf(opts),
                serialized,
                'EX',
                opts.ttlSeconds ?? AppCacheService.REHYDRATE_TTL_SEC,
            );
        }

        await this.prisma.$transaction(ops);
        await pipeline.exec();
        this.logger.debug(`setMany: записано ячеек: ${entries.length}`);
    }

    /** Удаляет запись из БД и Redis. */
    async delete(ref: AppCacheRef): Promise<boolean> {
        const portalId = await this.resolvePortalId(ref.domain);
        let deleted = 0;
        if (portalId !== null) {
            const res = await this.prisma.appCache.deleteMany({
                where: {
                    portalId,
                    app: ref.app,
                    key: ref.key,
                    bxUserId: BigInt(ref.bxUserId ?? 0),
                },
            });
            deleted = res.count;
        }
        await this.redisService.getClient().del(this.redisKeyOf(ref));
        return deleted > 0;
    }

    // ─────────────────────── инспекция (для контроллера) ───────────────────────

    async list(
        filter: AppCacheListRequestDto,
    ): Promise<AppCacheListResponseDto> {
        const where = this.buildWhere(filter);
        if (!filter.includeExpired) {
            where.OR = [{ expiredAt: null }, { expiredAt: { gt: new Date() } }];
        }

        const take = Math.min(filter.take ?? 50, AppCacheService.LIST_MAX_TAKE);

        const [total, rows] = await Promise.all([
            this.prisma.appCache.count({ where }),
            this.prisma.appCache.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                take,
                skip: filter.skip ?? 0,
                // data не тянем — полезная нагрузка бывает большой
                omit: { data: true, meta: true },
            }),
        ]);

        const inRedis = await this.checkInRedis(rows);
        return {
            items: rows.map((row, i) => this.toItemDto(row, inRedis[i])),
            total,
        };
    }

    /** Запись целиком (с data) по id или по адресу app+domain+key. */
    async getEntry(req: {
        id?: string;
        app?: string;
        domain?: string;
        key?: string;
        bxUserId?: number;
    }): Promise<AppCacheEntryDto> {
        let row: AppCache | null = null;
        if (req.id) {
            row = await this.prisma.appCache.findUnique({
                where: { id: req.id },
            });
        } else if (req.app && req.domain && req.key) {
            row = await this.findRow({
                app: req.app,
                domain: req.domain,
                key: req.key,
                bxUserId: req.bxUserId,
            });
        }
        if (!row) {
            throw new NotFoundException('Запись кэша не найдена');
        }

        const [inRedis] = await this.checkInRedis([row]);
        return {
            ...this.toItemDto(row, inRedis),
            data: row.data,
            meta: (row.meta as Record<string, unknown> | null) ?? null,
        };
    }

    async deleteById(id: string): Promise<boolean> {
        const row = await this.prisma.appCache.findUnique({ where: { id } });
        if (!row) return false;
        await this.deleteRow(row);
        return true;
    }

    /**
     * Пакетный сброс по фильтру app/domain/group/keyPrefix.
     * Точные Redis-ключи берём из строк БД; при сбросе без group/keyPrefix
     * дополнительно проходим SCAN-паттерном — подчистит осиротевшие ключи.
     */
    async reset(
        filter: AppCacheResetRequestDto,
    ): Promise<AppCacheResetResponseDto> {
        const where = this.buildWhere(filter);
        const rows = await this.prisma.appCache.findMany({
            where,
            select: { app: true, domain: true, bxUserId: true, key: true },
        });

        const client = this.redisService.getClient();
        let deletedRedis = 0;
        for (let i = 0; i < rows.length; i += 500) {
            const keys = rows
                .slice(i, i + 500)
                .map(r =>
                    buildAppCacheRedisKey(r.app, r.domain, r.bxUserId, r.key),
                );
            if (keys.length) deletedRedis += await client.del(...keys);
        }

        const { count: deletedDb } = await this.prisma.appCache.deleteMany({
            where,
        });

        if (!filter.group && !filter.keyPrefix && !filter.keySuffix) {
            const pattern = buildAppCacheRedisPattern(
                filter.app,
                filter.domain,
            );
            const stream = client.scanStream({ match: pattern, count: 100 });
            for await (const keys of stream as AsyncIterable<string[]>) {
                if (keys.length) deletedRedis += await client.del(...keys);
            }
        }

        this.logger.log(
            `Сброс кэша ${JSON.stringify(filter)}: БД ${deletedDb}, Redis ${deletedRedis}`,
        );
        return { deletedDb, deletedRedis };
    }

    /** Чистит протухшие строки БД (Redis протухает сам по TTL). */
    @Cron(CronExpression.EVERY_HOUR)
    async purgeExpired(): Promise<number> {
        const { count } = await this.prisma.appCache.deleteMany({
            where: { expiredAt: { lte: new Date() } },
        });
        if (count > 0) {
            this.logger.log(`Удалено протухших записей app_cache: ${count}`);
        }
        return count;
    }

    // ───────────────────────────── внутренности ─────────────────────────────

    private redisKeyOf(ref: AppCacheRef): string {
        return buildAppCacheRedisKey(
            ref.app,
            ref.domain,
            ref.bxUserId ?? 0,
            ref.key,
        );
    }

    private async findRow(ref: AppCacheRef): Promise<AppCache | null> {
        const portalId = await this.resolvePortalId(ref.domain);
        if (portalId === null) return null;
        return this.prisma.appCache.findUnique({
            where: {
                portalId_app_key_bxUserId: {
                    portalId,
                    app: ref.app,
                    key: ref.key,
                    bxUserId: BigInt(ref.bxUserId ?? 0),
                },
            },
        });
    }

    private async resolvePortalId(domain: string): Promise<bigint | null> {
        const cached = this.portalIdByDomain.get(domain);
        if (cached !== undefined) return cached;

        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: { id: true },
        });
        if (!portal) return null;

        this.portalIdByDomain.set(domain, portal.id);
        return portal.id;
    }

    private async requirePortalId(domain: string): Promise<bigint> {
        const portalId = await this.resolvePortalId(domain);
        if (portalId === null) {
            throw new NotFoundException(`Портал не найден по домену ${domain}`);
        }
        return portalId;
    }

    private isExpired(row: Pick<AppCache, 'expiredAt'>): boolean {
        return row.expiredAt !== null && row.expiredAt.getTime() <= Date.now();
    }

    /** Сколько секунд жить ключу в Redis при регидрации/записи. */
    private remainingTtlSec(row: Pick<AppCache, 'expiredAt'>): number {
        if (!row.expiredAt) return AppCacheService.REHYDRATE_TTL_SEC;
        return Math.max(
            1,
            Math.floor((row.expiredAt.getTime() - Date.now()) / 1000),
        );
    }

    private async deleteRow(
        row: Pick<AppCache, 'id' | 'app' | 'domain' | 'bxUserId' | 'key'>,
    ): Promise<void> {
        await this.prisma.appCache.deleteMany({ where: { id: row.id } });
        await this.redisService
            .getClient()
            .del(
                buildAppCacheRedisKey(
                    row.app,
                    row.domain,
                    row.bxUserId,
                    row.key,
                ),
            );
    }

    private buildWhere(filter: {
        app?: string;
        domain?: string;
        group?: string;
        keyPrefix?: string;
        keySuffix?: string;
        bxUserId?: number;
    }): Prisma.AppCacheWhereInput {
        const where: Prisma.AppCacheWhereInput = {};
        if (filter.app) where.app = filter.app;
        if (filter.domain) where.domain = filter.domain;
        if (filter.group) where.group = filter.group;
        if (filter.keyPrefix || filter.keySuffix) {
            where.key = {
                ...(filter.keyPrefix ? { startsWith: filter.keyPrefix } : {}),
                ...(filter.keySuffix ? { endsWith: filter.keySuffix } : {}),
            };
        }
        if (filter.bxUserId !== undefined) {
            where.bxUserId = BigInt(filter.bxUserId);
        }
        return where;
    }

    /** EXISTS пачкой через pipeline — колонка inRedis в инспекции. */
    private async checkInRedis(
        rows: Pick<AppCache, 'app' | 'domain' | 'bxUserId' | 'key'>[],
    ): Promise<boolean[]> {
        if (rows.length === 0) return [];
        const pipeline = this.redisService.getClient().pipeline();
        for (const row of rows) {
            pipeline.exists(
                buildAppCacheRedisKey(
                    row.app,
                    row.domain,
                    row.bxUserId,
                    row.key,
                ),
            );
        }
        const results = await pipeline.exec();
        return (results ?? []).map(([, value]) => value === 1);
    }

    private toItemDto(
        row: Omit<AppCache, 'data' | 'meta'>,
        inRedis: boolean,
    ): AppCacheItemDto {
        return {
            id: row.id,
            app: row.app,
            domain: row.domain,
            portalId: Number(row.portalId),
            bxUserId: Number(row.bxUserId),
            key: row.key,
            group: row.group,
            checksum: row.checksum,
            tags: (row.tags as string[] | null) ?? null,
            expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
            isExpired: this.isExpired(row),
            inRedis,
            createdAt: row.createdAt ? row.createdAt.toISOString() : null,
            updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
        };
    }
}
