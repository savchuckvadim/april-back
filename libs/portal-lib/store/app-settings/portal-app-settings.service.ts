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
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
    PortalAppSettingsPatch,
    PortalAppSettingsValues,
} from './portal-app-settings.schema';

/** Готовые настройки кэшируются коротко: быстрый доступ из всех приложений. */
const CACHE_TTL_SECONDS = 300;

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

    /** Действующие настройки приложения на домене: дефолты + БД, с кэшем. */
    async resolve<App extends EnumPortalAppCode>(
        domain: string,
        app: App,
    ): Promise<PortalAppSettingsValues<App>> {
        const cacheKey = this.cacheKey(domain, app);
        const cached = await this.redis.get(cacheKey).catch(() => null);
        if (cached) {
            return JSON.parse(cached) as PortalAppSettingsValues<App>;
        }

        const record = await this.repository.findByDomain(domain, app);
        const values = this.merge(app, record);
        await this.redis
            .set(cacheKey, JSON.stringify(values), 'EX', CACHE_TTL_SECONDS)
            .catch(() => undefined);
        return values;
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
        return this.merge(app, record);
    }

    /** Дефолты схемы + сохранённые в БД значения (по snake_case-кодам). */
    private merge<App extends EnumPortalAppCode>(
        app: App,
        record: PortalAppSettingsRecord | null,
    ): PortalAppSettingsValues<App> {
        const defaults = getPortalAppDefaults(app) as Record<string, unknown>;
        if (!record) return defaults as PortalAppSettingsValues<App>;

        const schema = PORTAL_APP_SETTINGS_SCHEMA[app] as Record<
            string,
            PortalAppSettingDescriptor
        >;
        const values: Record<string, unknown> = { ...defaults };
        for (const [key, descriptor] of Object.entries(schema)) {
            const raw = record.settings[descriptor.code];
            if (raw !== undefined && typeof raw === descriptor.type) {
                values[key] = raw;
            }
        }
        return values as PortalAppSettingsValues<App>;
    }

    private async requireDomain(portalId: number): Promise<string> {
        const portal = await this.portalRepository.findById(portalId);
        if (!portal?.domain) {
            throw new NotFoundException(`Портал ${portalId} не найден`);
        }
        return portal.domain;
    }

    private cacheKey(domain: string, app: EnumPortalAppCode): string {
        return `portal-app-settings:${domain}:${app}`;
    }
}
