import { Module } from '@nestjs/common';

import { PortalPrismaRepository } from './portal.prisma.repository';
import { PortalRepository } from './portal.repository';
import { PortalController } from './portal.controller';
import { PortalStoreService } from './portal-store.service';
import { PortalOuterService } from './outer/portal-outer.service';
import { PortalOuterController } from './outer/portal-outer.controller';
import { OnlineAdminModule } from '@lib/online/client/admin/online-admin.module';
import { OnlineModule } from '@lib/online/client/online/api-online.module';
import { PortalKeysController } from './keys/portal-keys.controller';
import { PortalKeysService } from './keys/portal-keys.service';
import { PortalKeyCryptoService } from './keys/portal-key-crypto.service';

@Module({
    imports: [OnlineAdminModule, OnlineModule],
    controllers: [PortalController, PortalOuterController, PortalKeysController],
    providers: [
        {
            provide: PortalRepository,
            useClass: PortalPrismaRepository,
        },
        PortalStoreService,
        PortalOuterService,
        PortalKeysService,
        PortalKeyCryptoService,
        // APIOnlineClient,
        // APIOnlineAdminClient,
        // HttpService,
        // ConfigService
    ],
    exports: [PortalRepository, PortalStoreService, PortalKeysService],
})
export class PortalStoreModule {}
