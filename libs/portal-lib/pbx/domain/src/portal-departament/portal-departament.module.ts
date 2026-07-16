import { Module } from '@nestjs/common';
import { PortalDepartamentService } from './services/portal-departament.service';
import { PortalDepartamentController } from './controllers/portal-departament.controller';
import { PortalDepartamentRepository } from './repositories/portal-departament.repository';
import { PortalDepartamentPrismaRepository } from './repositories/portal-departament.prisma.repository';

@Module({
    controllers: [PortalDepartamentController],
    providers: [
        PortalDepartamentService,
        {
            provide: PortalDepartamentRepository,
            useClass: PortalDepartamentPrismaRepository,
        },
    ],
    exports: [PortalDepartamentService],
})
export class PortalDepartamentModule {}
