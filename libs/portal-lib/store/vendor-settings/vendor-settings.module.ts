import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VENDOR_SETTINGS_READER } from '@lib/vendor-settings';
import { PortalKeyCryptoService } from '../keys/portal-key-crypto.service';
import { VendorSettingsRepository } from './vendor-settings.repository';
import { VendorSettingsPrismaRepository } from './vendor-settings.prisma.repository';
import { VendorSettingsService } from './vendor-settings.service';

/**
 * Настройки вендора для ВСЕХ потребителей приложения. Глобальный: читатель
 * под токеном VENDOR_SETTINGS_READER инжектят `@Optional()` библиотеки
 * (@lib/egress-proxy, @lib/llm-gateway, call-lib), которые импортируются во
 * многих модулях — иначе каждому пришлось бы тянуть этот модуль. Подключать
 * ОДИН раз в корневом модуле приложения; без него библиотеки работают по env.
 * Админ-роуты — отдельно, в apps/admin (VendorSettingsAdminModule).
 */
@Global()
@Module({
    imports: [ConfigModule],
    providers: [
        PortalKeyCryptoService,
        {
            provide: VendorSettingsRepository,
            useClass: VendorSettingsPrismaRepository,
        },
        VendorSettingsService,
        { provide: VENDOR_SETTINGS_READER, useExisting: VendorSettingsService },
    ],
    exports: [VendorSettingsService, VENDOR_SETTINGS_READER],
})
export class VendorSettingsModule {}
