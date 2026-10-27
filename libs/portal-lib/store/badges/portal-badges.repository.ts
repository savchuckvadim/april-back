import { Injectable } from '@nestjs/common';
import { PortalAppSettingsRepository } from '../app-settings/portal-app-settings.repository';
import { EnumPortalAppCode } from '../app-settings/portal-app-settings.schema';
import { parseBadgeDocument } from './portal-badges.document';
import {
    BADGES_SETTINGS_KEY,
    BadgeCatalogDocument,
} from './portal-badges.schema';

/** Хранилище документа каталога бейджиков портала. */
export abstract class PortalBadgesRepository {
    /** Документ портала по домену; не сохраняли — null. */
    abstract findByDomain(domain: string): Promise<BadgeCatalogDocument | null>;

    /** Сохранить документ целиком (режим и свой набор). */
    abstract save(
        portalId: number,
        domain: string,
        document: BadgeCatalogDocument,
    ): Promise<BadgeCatalogDocument>;
}

/**
 * Реализация поверх `portal_app_settings`: документ лежит одним ключом
 * (`comment_badges`) в JSON-колонке настроек приложения event-sales.
 *
 * Почему не своя таблица: миграции живут в Laravel-проекте `online`, а
 * JSON-колонка уже есть и сливается при upsert — чужие ключи настроек
 * сохранение не трогает, и наоборот: реестр скалярных настроек этот ключ
 * не знает и при чтении/записи пропускает (решение владельца 27.10.2026).
 */
@Injectable()
export class PortalBadgesAppSettingsRepository
    implements PortalBadgesRepository
{
    constructor(private readonly settings: PortalAppSettingsRepository) {}

    async findByDomain(domain: string): Promise<BadgeCatalogDocument | null> {
        const record = await this.settings.findByDomain(
            domain,
            EnumPortalAppCode.eventSales,
        );
        return parseBadgeDocument(record?.settings[BADGES_SETTINGS_KEY]);
    }

    async save(
        portalId: number,
        domain: string,
        document: BadgeCatalogDocument,
    ): Promise<BadgeCatalogDocument> {
        const record = await this.settings.upsert(
            portalId,
            domain,
            EnumPortalAppCode.eventSales,
            { [BADGES_SETTINGS_KEY]: document },
        );
        const saved = parseBadgeDocument(record.settings[BADGES_SETTINGS_KEY]);
        // Записали — и не смогли прочитать обратно: это не «документа нет»,
        // а сломанная запись; молчать здесь значило бы вернуть пустоту как
        // успех.
        if (!saved) {
            throw new Error(
                `Каталог бейджиков портала ${portalId} записан, но не читается обратно`,
            );
        }
        return saved;
    }
}
