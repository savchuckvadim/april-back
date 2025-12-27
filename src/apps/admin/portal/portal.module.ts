import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { AdminPortalService } from './services/portal.service';
import { AdminPortalRepository } from './repositories/portal.repository';
import { AdminPortalPrismaRepository } from './repositories/portal.prisma.repository';
import { AdminPortalController } from './controllers/portal.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        AdminPortalService,
        {
            provide: AdminPortalRepository,
            useClass: AdminPortalPrismaRepository,
        },
    ],
    controllers: [AdminPortalController],
    exports: [AdminPortalService, AdminPortalRepository],
})
export class AdminPortalModule { }

