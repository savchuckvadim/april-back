import { Module } from '@nestjs/common';
import { PortalRqService } from './services/portal-rq.service';
import { PortalRqRepository } from './repositories/portal-rq.repository';
import { PortalRqPrismaRepository } from './repositories/portal-rq.prisma.repository';

@Module({
    providers: [
        PortalRqService,
        {
            provide: PortalRqRepository,
            useClass: PortalRqPrismaRepository,
        },
    ],
    exports: [PortalRqService],
})
export class PortalRqModule {}
