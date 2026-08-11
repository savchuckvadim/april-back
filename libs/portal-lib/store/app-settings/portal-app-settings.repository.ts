import { EnumPortalAppCode } from './portal-app-settings.schema';

/** Сырая строка настроек приложения (JSON как есть, без дефолтов). */
export interface PortalAppSettingsRecord {
    portalId: number;
    domain: string;
    appCode: EnumPortalAppCode;
    /** Сохранённые ключи (snake_case-коды из схемы) → значения. */
    settings: Record<string, unknown>;
    updatedAt: Date | null;
}

/** Хранилище настроек приложений портала (реализация — Prisma). */
export abstract class PortalAppSettingsRepository {
    abstract findByDomain(
        domain: string,
        appCode: EnumPortalAppCode,
    ): Promise<PortalAppSettingsRecord | null>;

    abstract findByPortalId(
        portalId: number,
    ): Promise<PortalAppSettingsRecord[]>;

    /** Все строки одного приложения по всем порталам (для планировщиков). */
    abstract findByAppCode(
        appCode: EnumPortalAppCode,
    ): Promise<PortalAppSettingsRecord[]>;

    abstract upsert(
        portalId: number,
        domain: string,
        appCode: EnumPortalAppCode,
        settings: Record<string, unknown>,
    ): Promise<PortalAppSettingsRecord>;
}
