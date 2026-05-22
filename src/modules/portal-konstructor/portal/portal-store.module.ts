import { Module } from '@nestjs/common';

import { PortalPrismaRepository } from './portal.prisma.repository';
import { PortalRepository } from './portal.repository';
import { PortalController } from './portal.controller';
import { PortalStoreService } from './portal-store.service';
import { PortalOuterService } from './outer/portal-outer.service';
import { PortalOuterController } from './outer/portal-outer.controller';
import { OnlineAdminModule } from '../../../clients/online/client/admin/online-admin.module';
import { OnlineModule } from '../../../clients/online/client/online/api-online.module';

@Module({
    imports: [OnlineAdminModule, OnlineModule],
    controllers: [PortalController, PortalOuterController],
    providers: [
        {
            provide: PortalRepository,
            useClass: PortalPrismaRepository,
        },
        PortalStoreService,
        PortalOuterService,
        // APIOnlineClient,
        // APIOnlineAdminClient,
        // HttpService,
        // ConfigService
    ],
    exports: [PortalRepository, PortalStoreService],
})
export class PortalStoreModule {}
