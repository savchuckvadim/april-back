import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalLeadService } from './services/portal-lead.service';
import { PortalLeadRepository } from './repositories/portal-lead.repository';
import { PortalLeadPrismaRepository } from './repositories/portal-lead.prisma.repository';

@Module({
    imports: [PbxFieldModule],
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
