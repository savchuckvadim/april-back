import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    VENDOR_SECRET_MASK,
    VENDOR_SETTINGS,
    type VendorSettingDefinition,
    type VendorSettingKey,
    type VendorSettingSource,
    type VendorSettingsReader,
    isVendorSettingKey,
    vendorSettingOf,
} from '@lib/vendor-settings';
import { PortalKeyCryptoService } from '../keys/portal-key-crypto.service';
import {
    VendorSettingRow,
    VendorSettingsRepository,
} from './vendor-settings.repository';

/** TTL кэша таблицы, мс: правка в админке действует в течение минуты без выкладки. */
export const VENDOR_SETTINGS_CACHE_TTL_MS = 60_000;

/** Настройка глазами админки: описание из реестра плюс состояние. */
export interface VendorSettingView
    extends Omit<VendorSettingDefinition, 'validate'> {
    /** Значение из админки для несекретов; у секретов всегда null (см. isSet). */
    value: string | null;
    /** Задано ли значение в админке. */
    isSet: boolean;
    /** Есть ли значение в окружении приложения. */
    envSet: boolean;
    source: VendorSettingSource;
    updatedAt: Date | null;
    updatedBy: string | null;
}

type RowMap = Map<string, VendorSettingRow>;

/**
 * Настройки вендора: таблица vendor_settings поверх переменных окружения.
 * Один общий читатель для всех потребителей (прокси, шлюз LLM, Whisper,
 * чек-лист админки): значение из админки важнее env, секреты расшифровываются
 * на лету, вся таблица читается разом и кэшируется на минуту. Таблицы ещё
 * нет или БД недоступна — работаем по env и предупреждаем не чаще раза в
 * минуту: настройки не должны ронять приложение.
 */
@Injectable()
export class VendorSettingsService implements VendorSettingsReader {
    private readonly logger = new Logger(VendorSettingsService.name);
    private cache: { rows: RowMap; expiresAt: number } | null = null;
    private loading: Promise<RowMap> | null = null;
    private lastWarnAt = 0;

    constructor(
        private readonly repository: VendorSettingsRepository,
        private readonly crypto: PortalKeyCryptoService,
        private readonly configService: ConfigService,
    ) {}

    async get(key: string): Promise<string | null> {
        return (await this.getMany([key]))[key] ?? null;
    }

    async getMany(
        keys: readonly string[],
    ): Promise<Record<string, string | null>> {
        const rows = await this.rows();
        const result: Record<string, string | null> = {};
        for (const key of keys) {
            const admin = isVendorSettingKey(key)
                ? this.plainValue(rows.get(key))
                : null;
            result[key] = admin ?? this.envValue(key);
        }
        return result;
    }

    /** Все настройки реестра с состоянием — для страницы админки. */
    async list(): Promise<VendorSettingView[]> {
        const rows = await this.rows();
        return VENDOR_SETTINGS.map(definition =>
            this.view(definition, rows.get(definition.key)),
        );
    }

    /**
     * Сохранить значение из админки. Пусто или null — снять (действует env);
     * маска секрета — оставить прежнее. Непустое значение проходит проверку
     * реестра, секрет шифруется.
     */
    async save(
        key: VendorSettingKey,
        value: string | null,
        updatedBy: string | null,
    ): Promise<VendorSettingView> {
        const definition = vendorSettingOf(key);
        const trimmed = (value ?? '').trim();
        if (!trimmed) {
            await this.repository.remove(key);
        } else if (trimmed !== VENDOR_SECRET_MASK) {
            const problem = definition.validate?.(trimmed) ?? null;
            if (problem) throw new BadRequestException(problem);
            await this.repository.upsert({
                key,
                value: definition.secret
                    ? this.crypto.encrypt(trimmed)
                    : trimmed,
                isSecret: definition.secret,
                updatedBy,
            });
        }
        this.invalidate();
        const rows = await this.rows();
        return this.view(definition, rows.get(key));
    }

    /** Сброс кэша — после записи; тесты и редкие ручные сценарии. */
    invalidate(): void {
        this.cache = null;
    }

    private view(
        definition: VendorSettingDefinition,
        row: VendorSettingRow | undefined,
    ): VendorSettingView {
        const admin = this.plainValue(row);
        const env = this.envValue(definition.key);
        return {
            key: definition.key,
            group: definition.group,
            label: definition.label,
            description: definition.description,
            howTo: definition.howTo,
            secret: definition.secret,
            example: definition.example,
            value: definition.secret ? null : admin,
            isSet: admin !== null,
            envSet: env !== null,
            source: admin !== null ? 'admin' : env !== null ? 'env' : 'none',
            updatedAt: row?.updatedAt ?? null,
            updatedBy: row?.updatedBy ?? null,
        };
    }

    private async rows(): Promise<RowMap> {
        if (this.cache && this.cache.expiresAt > Date.now()) {
            return this.cache.rows;
        }
        if (!this.loading) {
            this.loading = this.load().finally(() => {
                this.loading = null;
            });
        }
        return this.loading;
    }

    private async load(): Promise<RowMap> {
        let rows: RowMap;
        try {
            rows = new Map(
                (await this.repository.findAll()).map(row => [row.key, row]),
            );
        } catch (error) {
            // Таблицы ещё нет (миграция не применена) или БД недоступна —
            // действуют env; пустой результат тоже кэшируем, чтобы не
            // долбить базу каждым вызовом.
            if (Date.now() - this.lastWarnAt > VENDOR_SETTINGS_CACHE_TTL_MS) {
                this.lastWarnAt = Date.now();
                this.logger.warn(
                    `Настройки вендора не прочитаны (${(error as Error).message}) — действуют переменные окружения`,
                );
            }
            rows = new Map();
        }
        this.cache = {
            rows,
            expiresAt: Date.now() + VENDOR_SETTINGS_CACHE_TTL_MS,
        };
        return rows;
    }

    /** Открытое значение строки: секрет расшифровывается; битый шифртекст — как не задано. */
    private plainValue(row: VendorSettingRow | undefined): string | null {
        if (!row?.value) return null;
        if (!row.isSecret) return row.value.trim() || null;
        try {
            return this.crypto.decrypt(row.value) || null;
        } catch (error) {
            this.logger.warn(
                `Секрет ${row.key} не расшифрован (${(error as Error).message}) — считаем незаданным`,
            );
            return null;
        }
    }

    private envValue(key: string): string | null {
        const value = (this.configService.get<string>(key) ?? '').trim();
        return value || null;
    }
}
