import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalCompanyService } from './services/portal-company.service';
import { PortalCompanyController } from './controllers/portal-company.controller';
import { PortalCompanyFieldController } from './controllers/portal-company-field.controller';
import { PortalCompanyRepository } from './repositories/portal-company.repository';
import { PortalCompanyPrismaRepository } from './repositories/portal-company.prisma.repository';

@Module({
    imports: [PbxFieldModule],
    controllers: [PortalCompanyController, PortalCompanyFieldController],
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
