import { Module } from '@nestjs/common';

import { PortalPrismaRepository } from './portal.prisma.repository';
import { PortalRepository } from './portal.repository';
import { PortalStoreService } from './portal-store.service';
import { PortalOnlineCacheService } from './portal-online-cache.service';
import { PortalOuterService } from './outer/portal-outer.service';
import { OnlineAdminModule } from '@lib/online/client/admin/online-admin.module';
import { OnlineModule } from '@lib/online/client/online/api-online.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalKeysService } from './keys/portal-keys.service';
import { PortalKeyCryptoService } from './keys/portal-key-crypto.service';
import { PortalAiSettingsRepository } from './ai-settings/portal-ai-settings.repository';
import { PortalAiSettingsPrismaRepository } from './ai-settings/portal-ai-settings.prisma.repository';
import { PortalAiSettingsService } from './ai-settings/portal-ai-settings.service';
import { PortalAppSettingsModule } from './app-settings/portal-app-settings.module';

/**
 * Сервисный модуль хранилища портала — БЕЗ контроллеров.
 *
 * CRUD-роуты портала и outer-интеграции вынесены в
 * {@link PortalStoreAdminModule}, ключи — в {@link PortalKeysAdminModule},
 * AI-настройки — в {@link PortalAiSettingsAdminModule}: приложения
 * (event-sales, konstructor, pbx-install, …) импортируют этот модуль ради
 * сервисов и не тащат чужие роуты в свой Swagger
 * (см. ai/rules/app-api-surface.md). Сервисы экспортируются админ-модулям.
 */
@Module({
    imports: [
        OnlineAdminModule,
        OnlineModule,
        RedisModule,
        PortalAppSettingsModule,
    ],
    providers: [
        {
            provide: PortalRepository,
            useClass: PortalPrismaRepository,
        },
        PortalStoreService,
        PortalOnlineCacheService,
        PortalOuterService,
        PortalKeysService,
        PortalKeyCryptoService,
        {
            provide: PortalAiSettingsRepository,
            useClass: PortalAiSettingsPrismaRepository,
        },
        PortalAiSettingsService,
        // APIOnlineClient,
        // APIOnlineAdminClient,
        // HttpService,
        // ConfigService
    ],
    exports: [
        PortalRepository,
        PortalStoreService,
        PortalOnlineCacheService,
        PortalOuterService,
        PortalKeysService,
        PortalAiSettingsService,
        PortalAppSettingsModule,
    ],
})
export class PortalStoreModule {}
