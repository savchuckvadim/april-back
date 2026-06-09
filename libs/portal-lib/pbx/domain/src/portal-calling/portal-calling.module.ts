import { Module } from '@nestjs/common';
import { PortalCallingService } from './services/portal-calling.service';
import { PortalCallingRepository } from './repositories/portal-calling.repository';
import { PortalCallingPrismaRepository } from './repositories/portal-calling.prisma.repository';

@Module({
    providers: [
        PortalCallingService,
        {
            provide: PortalCallingRepository,
            useClass: PortalCallingPrismaRepository,
        },
    ],
    exports: [PortalCallingService],
})
export class PortalCallingModule {}
