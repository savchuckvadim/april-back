import { Module } from '@nestjs/common';

import { PortalPrismaRepository } from './portal.prisma.repository';
import { PortalRepository } from './portal.repository';
import { PortalController } from './portal.controller';
import { PortalStoreService } from './portal-store.service';
import { PortalOnlineCacheService } from './portal-online-cache.service';
import { PortalOuterService } from './outer/portal-outer.service';
import { PortalOuterController } from './outer/portal-outer.controller';
import { OnlineAdminModule } from '@lib/online/client/admin/online-admin.module';
import { OnlineModule } from '@lib/online/client/online/api-online.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalKeysService } from './keys/portal-keys.service';
import { PortalKeyCryptoService } from './keys/portal-key-crypto.service';
import { PortalAiSettingsRepository } from './ai-settings/portal-ai-settings.repository';
import { PortalAiSettingsPrismaRepository } from './ai-settings/portal-ai-settings.prisma.repository';
import { PortalAiSettingsService } from './ai-settings/portal-ai-settings.service';

/**
 * Сервисный модуль хранилища портала. Админ-контроллер ключей вынесен в
 * {@link PortalKeysAdminModule} (`admin/portal/:portalId/keys`), чтобы приложения
 * (konstructor, pbx-install, …), импортящие модуль ради сервисов, не тащили
 * админ-роут в свой Swagger. PortalKeysService экспортируется для админ-модуля.
 */
@Module({
    imports: [OnlineAdminModule, OnlineModule, RedisModule],
    controllers: [PortalController, PortalOuterController],
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
        PortalKeysService,
        PortalAiSettingsService,
    ],
})
export class PortalStoreModule {}
