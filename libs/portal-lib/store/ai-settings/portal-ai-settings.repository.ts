import {
    PortalAiSettingsRecord,
    PortalAiSettingsUpdate,
    PortalAiSettingsWithDomain,
} from './portal-ai-settings.types';

/**
 * Хранилище настроек AI-конвейера на портал. Одна строка на портал;
 * отсутствие строки — легальное состояние, портал живёт на глобальных env.
 */
export abstract class PortalAiSettingsRepository {
    /** Настройки портала; null — строки нет (все значения глобальные). */
    abstract findByPortalId(
        portalId: number,
    ): Promise<PortalAiSettingsRecord | null>;

    /** Настройки по домену — путь конвейера, который знает только домен. */
    abstract findByDomain(
        domain: string,
    ): Promise<PortalAiSettingsRecord | null>;

    /**
     * Порталы, у которых AI-конвейер явно включён (`enabled = true`).
     * Источник списка доменов для планировщика вместо env-allowlist.
     */
    abstract findEnabled(): Promise<PortalAiSettingsWithDomain[]>;

    /**
     * Создать или обновить настройки портала. Поля, отсутствующие в
     * `update`, не трогаются; явный `null` сбрасывает значение на глобальное.
     */
    abstract upsert(
        portalId: number,
        domain: string,
        update: PortalAiSettingsUpdate,
    ): Promise<PortalAiSettingsRecord>;

    /** Отметить время успешного скана — по нему считается интервал портала. */
    abstract touchLastScan(portalId: number, scannedAt: Date): Promise<void>;
}
