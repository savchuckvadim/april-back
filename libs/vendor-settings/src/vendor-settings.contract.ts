/**
 * Контракт чтения настроек уровня вендора (April), общих для всех порталов:
 * исходящий прокси за рубеж и ключи AI-сервисов приложения. Значение из
 * админки (таблица vendor_settings) важнее переменной окружения с тем же
 * именем; нет ни того, ни другого — null.
 *
 * Лист-библиотека без Nest-модуля: её импортируют и потребители
 * (@lib/egress-proxy, @lib/llm-gateway, call-lib), и реализация в
 * portal-lib (VendorSettingsService) — так между ними нет цикла.
 */

/** DI-токен читателя: реализацию даёт глобальный VendorSettingsModule из portal-lib. */
export const VENDOR_SETTINGS_READER = 'VENDOR_SETTINGS_READER';

/** Маска заданного секрета в ответах админки; прислать её при сохранении = «оставить прежнее». */
export const VENDOR_SECRET_MASK = '••••••';

/** Что действует для настройки: значение из админки, из окружения или ничего. */
export const VENDOR_SETTING_SOURCES = ['admin', 'env', 'none'] as const;
export type VendorSettingSource = (typeof VENDOR_SETTING_SOURCES)[number];

export interface VendorSettingsReader {
    /** Значение настройки: из админки, иначе из env; нет — null. */
    get(key: string): Promise<string | null>;
    /** То же для набора ключей одним обращением (одна выборка из БД). */
    getMany(keys: readonly string[]): Promise<Record<string, string | null>>;
}

/**
 * Читатель «только env» — для приложений без VendorSettingsModule и для
 * тестов: поведение ровно как до появления настроек в админке.
 */
export function envOnlyReader(
    get: (key: string) => string | undefined,
): VendorSettingsReader {
    const read = (key: string): string | null => {
        const value = (get(key) ?? '').trim();
        return value || null;
    };
    return {
        get: key => Promise.resolve(read(key)),
        getMany: keys =>
            Promise.resolve(
                Object.fromEntries(keys.map(key => [key, read(key)])),
            ),
    };
}
