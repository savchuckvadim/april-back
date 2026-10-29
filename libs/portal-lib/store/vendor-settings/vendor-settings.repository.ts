/** Строка таблицы vendor_settings: у секретов `value` — шифртекст. */
export interface VendorSettingRow {
    key: string;
    value: string | null;
    isSecret: boolean;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface VendorSettingUpsert {
    key: string;
    /** Уже зашифрованное значение для секрета, открытое — для остальных. */
    value: string;
    isSecret: boolean;
    updatedBy: string | null;
}

/** Хранилище настроек вендора; реализация — Prisma, в тестах — память. */
export abstract class VendorSettingsRepository {
    abstract findAll(): Promise<VendorSettingRow[]>;
    abstract upsert(row: VendorSettingUpsert): Promise<void>;
    /** Снять значение из админки — строка удаляется, действует env. */
    abstract remove(key: string): Promise<void>;
}
