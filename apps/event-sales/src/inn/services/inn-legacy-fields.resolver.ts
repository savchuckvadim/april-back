import { Injectable, Logger } from '@nestjs/common';
import {
    InnLegacyFields,
    NO_INN_LEGACY_FIELDS,
    parseInnLegacyFieldNames,
} from '@lib/portal-lib/pbx-inn';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

/**
 * Старые поля портала с ИНН (настройки event-sales `inn_legacy_fields_*`,
 * владелец 26.11.2026) → списки имён полей для библиотеки ИНН.
 *
 * Читается при каждом открытии вкладки: настройки кэшированы в Redis
 * сервисом настроек, так что это не поход в базу. Настройки недоступны —
 * работаем без старых полей: вкладка «ИНН» из-за них падать не должна.
 */
@Injectable()
export class InnLegacyFieldsResolver {
    private readonly logger = new Logger(InnLegacyFieldsResolver.name);

    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async resolve(domain: string): Promise<InnLegacyFields> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return {
                deal: parseInnLegacyFieldNames(settings.innLegacyFieldsDeal),
                company: parseInnLegacyFieldNames(
                    settings.innLegacyFieldsCompany,
                ),
                lead: parseInnLegacyFieldNames(settings.innLegacyFieldsLead),
            };
        } catch (error) {
            this.logger.warn(
                `${domain}: старые поля ИНН не прочитаны из настроек — ` +
                    `вкладка работает без них: ${(error as Error).message}`,
            );
            return NO_INN_LEGACY_FIELDS;
        }
    }
}
