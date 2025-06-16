import { Module } from "@nestjs/common";

import { PortalPrismaRepository } from "./portal.prisma.repository";
import { PortalRepository } from "./portal.repository";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";
import { PortalOuterService } from "./outer/portal-outer.service";
import { PortalOuterController } from "./outer/portal-outer.controller";
import { APIOnlineClient } from "../../../clients/online";
import { APIOnlineAdminClient } from "../../../clients/online/client/admin/api-online-admin.client";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { HttpModule, HttpService } from "@nestjs/axios";
import { OnlineAdminModule } from "../../../clients/online/client/admin/online-admin.module";
import { OnlineModule } from "../../../clients/online/client/online/api-online.module";

@Module({
    imports: [OnlineAdminModule, OnlineModule,],
    controllers: [PortalController, PortalOuterController],
    providers: [
        {
            provide: PortalRepository,
            useClass: PortalPrismaRepository,
        },
        PortalService,
        PortalOuterService,
        // APIOnlineClient,
        // APIOnlineAdminClient,
        // HttpService,
        // ConfigService
    ],
    exports: [PortalRepository, PortalService],
})
export class PortalModule { } 