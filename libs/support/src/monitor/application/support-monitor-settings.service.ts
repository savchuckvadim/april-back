import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    normalizeSupportDomain,
    SupportMonitorOptions,
    toSupportMonitorOptions,
} from './support-monitor-options';

/**
 * Настройки монитора поддержки — блок «Портал (общие)» портала, где живёт
 * открытая линия. Читателей двое (крон и предпросмотр админки), правила
 * разбора одни — `toSupportMonitorOptions`.
 */
@Injectable()
export class SupportMonitorSettingsService {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async resolveOptions(domain: string): Promise<SupportMonitorOptions> {
        const values = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.portal,
        );
        return toSupportMonitorOptions(domain, values);
    }

    /** Порталы, где монитор включён в админке. */
    async listEnabledDomains(): Promise<string[]> {
        const rows = await this.appSettings.listByAppCode(
            EnumPortalAppCode.portal,
        );
        const enabledCode =
            PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.portal]
                .supportMonitorEnabled.code;
        return rows
            .filter(row => row.settings[enabledCode] === true)
            .map(row => normalizeSupportDomain(row.domain))
            .filter(Boolean);
    }
}
