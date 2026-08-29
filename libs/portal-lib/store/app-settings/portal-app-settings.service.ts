import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '@lib/core/redis/redis.service';
import { PortalRepository } from '../portal.repository';
import {
    PortalAppSettingsRecord,
    PortalAppSettingsRepository,
} from './portal-app-settings.repository';
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    getStoredAppSettingKeys,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
    PortalAppSettingsPatch,
    PortalAppSettingsValues,
} from './portal-app-settings.schema';

/** Готовые настройки кэшируются коротко: быстрый доступ из всех приложений. */
const CACHE_TTL_SECONDS = 300;

/**
 * Версия ФОРМЫ кэшируемого значения — часть ключа Redis.
 *
 * Поднимать при смене формы payload'а, а не при добавлении ключа в реестр.
 * v2 = `{ values, storedKeys }`: без версии записи прошлой формы (плоские
 * значения без признака «задано на портале») доживали бы свой TTL и
 * отдавали фрейму ответ без признака — ровно те 5 минут после деплоя,
 * когда дефолт реестра снова гасил бы доменные флаги.
 */
const CACHE_VERSION = 'v2';

/** Настройки приложения + признак «ключ задан на портале». */
export interface PortalAppSettingsResolved<App extends EnumPortalAppCode> {
    /** Полный набор: дефолты кода, перекрытые сохранённым на портале. */
    values: PortalAppSettingsValues<App>;
    /**
     * Ключи схемы, которые РЕАЛЬНО лежат в JSON портала. Остальное в
     * `values` — дефолты кода, и потребитель вправе их не применять:
     * фрейму это единственный способ отличить «портал выключил» от
     * «портал не трогал» (см. getStoredAppSettingKeys).
     */
    storedKeys: string[];
}

/**
 * Настройки placement-приложений на портал.
 *
 * Чтение (`resolve`) — горячий путь приложений и фронтов: дефолты схемы
 * сливаются с сохранённым в БД и кэшируются в Redis. Запись (`save`) —
 * админка: только известные схеме ключи, кэш инвалидируется.
 *
 * Реестр приложений/ключей/дефолтов — PORTAL_APP_SETTINGS_SCHEMA
 * (тотальная типизация: ключи и типы значений автокомплитны).
 */
@Injectable()
export class PortalAppSettingsService {
    private readonly logger = new Logger(PortalAppSettingsService.name);
    private readonly redis: Redis;

    constructor(
        private readonly repository: PortalAppSettingsRepository,
        private readonly portalRepository: PortalRepository,
        redisService: RedisService,
    ) {
        this.redis = redisService.getClient();
    }

    /**
     * Действующие настройки приложения на домене: дефолты + БД, с кэшем.
     *
     * Тонкая обёртка над `resolveWithStored` — для бэковых потребителей,
     * которым нужно только значение (`settings.withChecklistSale`).
     */
    async resolve<App extends EnumPortalAppCode>(
        domain: string,
        app: App,
    ): Promise<PortalAppSettingsValues<App>> {
        return (await this.resolveWithStored(domain, app)).values;
    }

    /**
     * То же + признак «ключ задан на портале» — для фрейма.
     *
     * Фронт держит СВОИ дефолты (доменный хардкод) и без признака не может
     * отличить «портал выключил флаг» от «портал его не трогал»: дефолт
     * реестра `false` приезжает неотличимо от сохранённого и гасит рабочие
     * фичи боевых порталов. Признак лежит В КЭШЕ вместе со значениями —
     * иначе терялся бы на первом же попадании в Redis.
     */
    async resolveWithStored<App extends EnumPortalAppCode>(
        domain: string,
        app: App,
    ): Promise<PortalAppSettingsResolved<App>> {
        const cacheKey = this.cacheKey(domain, app);
        const cached = await this.redis.get(cacheKey).catch(() => null);
        const parsed = cached ? this.parseCached<App>(cached) : null;
        if (parsed) return parsed;

        const record = await this.repository.findByDomain(domain, app);
        const resolved = this.merge(app, record);
        await this.redis
            .set(cacheKey, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS)
            .catch(() => undefined);
        return resolved;
    }

    /** Все строки настроек портала (админка: вкладка «Приложения»). */
    async listByPortal(portalId: number): Promise<PortalAppSettingsRecord[]> {
        return this.repository.findByPortalId(portalId);
    }

    /** Строки одного приложения по всем порталам (ростеры планировщиков). */
    async listByAppCode(
        appCode: EnumPortalAppCode,
    ): Promise<PortalAppSettingsRecord[]> {
        return this.repository.findByAppCode(appCode);
    }

    /**
     * Сохранение из админки: применяются только известные схеме ключи,
     * значения проверяются по типу дескриптора, кэш домена сбрасывается.
     *
     * Смысл сохранения не меняется от появления `storedKeys`: пишем то,
     * что прислали. Значение, СОВПАДАЮЩЕЕ с дефолтом кода, тоже ложится в
     * JSON и делает ключ «заданным на портале» — это верно: владелец
     * выбрал его явно, и фрейм обязан его применить поверх своего
     * доменного значения. Снять решение портала можно только явным
     * `null` — тогда ключ удаляется из JSON и снова становится дефолтом.
     */
    async save<App extends EnumPortalAppCode>(
        portalId: number,
        app: App,
        patch: PortalAppSettingsPatch<App>,
    ): Promise<PortalAppSettingsValues<App>> {
        const domain = await this.requireDomain(portalId);
        const schema = PORTAL_APP_SETTINGS_SCHEMA[app] as Record<
            string,
            PortalAppSettingDescriptor
        >;
        // Ключи принимаются в обоих видах: camelCase-ключ схемы (типизированный
        // вызов из кода) и snake_case-код (админка шлёт descriptor.code).
        const byAnyKey = new Map<string, PortalAppSettingDescriptor>();
        for (const [key, descriptor] of Object.entries(schema)) {
            byAnyKey.set(key, descriptor);
            byAnyKey.set(descriptor.code, descriptor);
        }

        const stored: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
            const descriptor = byAnyKey.get(key);
            if (!descriptor || value === undefined) continue;
            // null = «сбросить на дефолт кода»: ключ удалится из JSON.
            if (value === null) {
                stored[descriptor.code] = null;
                continue;
            }
            if (typeof value !== descriptor.type) {
                this.logger.warn(
                    `Настройка ${app}.${key}: ожидался ${descriptor.type}, получен ${typeof value} — пропущено`,
                );
                continue;
            }
            stored[descriptor.code] = value;
        }

        const record = await this.repository.upsert(
            portalId,
            domain,
            app,
            stored,
        );
        await this.redis.del(this.cacheKey(domain, app)).catch(() => undefined);
        this.logger.log(
            `Настройки ${app} портала ${portalId} (${domain}) сохранены: ` +
                `${Object.keys(stored).join(', ') || 'без изменений'}`,
        );
        return this.merge(app, record).values;
    }

    /**
     * Дефолты схемы + сохранённые в БД значения (по snake_case-кодам) и
     * список ключей, которые пришли именно из БД.
     *
     * Записи в БД нет — отдаём чистые дефолты и ПУСТОЙ список: на портале
     * не задано ничего, строка при чтении не создаётся.
     */
    private merge<App extends EnumPortalAppCode>(
        app: App,
        record: PortalAppSettingsRecord | null,
    ): PortalAppSettingsResolved<App> {
        const defaults = getPortalAppDefaults(app) as Record<string, unknown>;
        if (!record) {
            return {
                values: defaults as PortalAppSettingsValues<App>,
                storedKeys: [],
            };
        }

        const schema = PORTAL_APP_SETTINGS_SCHEMA[app] as Record<
            string,
            PortalAppSettingDescriptor
        >;
        const storedKeys = getStoredAppSettingKeys(app, record.settings);
        const values: Record<string, unknown> = { ...defaults };
        for (const key of storedKeys) {
            values[key] = record.settings[schema[key].code];
        }
        return {
            values: values as PortalAppSettingsValues<App>,
            storedKeys,
        };
    }

    /**
     * Значение из кэша. Осторожно: запись могла лечь другой версией кода
     * (или испортиться) — форму проверяем, иначе идём в БД как при промахе.
     */
    private parseCached<App extends EnumPortalAppCode>(
        raw: string,
    ): PortalAppSettingsResolved<App> | null {
        try {
            const parsed = JSON.parse(raw) as Partial<
                PortalAppSettingsResolved<App>
            >;
            const values = parsed?.values as
                | Record<string, unknown>
                | undefined;
            if (!values || typeof values !== 'object') return null;
            if (!Array.isArray(parsed.storedKeys)) return null;
            return {
                values: parsed.values as PortalAppSettingsValues<App>,
                storedKeys: parsed.storedKeys,
            };
        } catch {
            return null;
        }
    }

    private async requireDomain(portalId: number): Promise<string> {
        const portal = await this.portalRepository.findById(portalId);
        if (!portal?.domain) {
            throw new NotFoundException(`Портал ${portalId} не найден`);
        }
        return portal.domain;
    }

    private cacheKey(domain: string, app: EnumPortalAppCode): string {
        return `portal-app-settings:${CACHE_VERSION}:${domain}:${app}`;
    }
}
