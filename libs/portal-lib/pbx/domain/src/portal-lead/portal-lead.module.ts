import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalLeadService } from './services/portal-lead.service';
import { PortalLeadController } from './controllers/portal-lead.controller';
import { PortalLeadFieldController } from './controllers/portal-lead-field.controller';
import { PortalLeadRepository } from './repositories/portal-lead.repository';
import { PortalLeadPrismaRepository } from './repositories/portal-lead.prisma.repository';

@Module({
    imports: [PbxFieldModule],
    controllers: [PortalLeadController, PortalLeadFieldController],
    providers: [
        PortalLeadService,
        {
            provide: PortalLeadRepository,
            useClass: PortalLeadPrismaRepository,
        },
    ],
    exports: [PortalLeadService],
})
export class PortalLeadModule {}
