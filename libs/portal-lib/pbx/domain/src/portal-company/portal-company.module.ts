import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalCompanyService } from './services/portal-company.service';
import { PortalCompanyRepository } from './repositories/portal-company.repository';
import { PortalCompanyPrismaRepository } from './repositories/portal-company.prisma.repository';

@Module({
    imports: [PbxFieldModule],
    providers: [
        PortalCompanyService,
        {
            provide: PortalCompanyRepository,
            useClass: PortalCompanyPrismaRepository,
        },
    ],
    exports: [PortalCompanyService],
})
export class PortalCompanyModule {}
