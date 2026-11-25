import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    envOnlyReader,
    VENDOR_SETTINGS_READER,
    type VendorSettingsReader,
} from '@lib/vendor-settings';
import { PORTAL_VIEW_SUPPORT_URL_SETTING } from './portal-view.const';
import { supportUrlOf } from './portal-view.util';

/**
 * Ссылка на чат поддержки для клиентов — настройка вендора
 * `SUPPORT_CHAT_URL` («Настройки приложения»). Не задана, не читается или
 * не http(s)-адрес — null: кнопки поддержки в шапке «Отчёта» нет.
 */
@Injectable()
export class PortalViewSupportUrlReader {
    private readonly settings: VendorSettingsReader;

    constructor(
        config: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
    ) {
        this.settings =
            settings ?? envOnlyReader(key => config.get<string>(key));
    }

    async read(): Promise<string | null> {
        const configured = await this.settings
            .get(PORTAL_VIEW_SUPPORT_URL_SETTING)
            .catch(() => null);
        return supportUrlOf(configured);
    }
}
