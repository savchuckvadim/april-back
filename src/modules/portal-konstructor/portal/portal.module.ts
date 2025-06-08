import { Module } from "@nestjs/common";

import { PortalPrismaRepository } from "./portal.prisma.repository";
import { PortalRepository } from "./portal.repository";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";

@Module({
    controllers: [PortalController],
    providers: [
        {
            provide: PortalRepository,
            useClass: PortalPrismaRepository,
        },
        PortalService
    ],
    exports: [PortalRepository, PortalService],
})
export class PortalModule { } 