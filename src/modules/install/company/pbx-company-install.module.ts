import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@/modules/portal-konstructor/portal/portal-store.module';
import { Module } from '@nestjs/common';
import { PbxCompanyMonitoringService } from './services/pbx-company-monitoring.service';
import { PbxCompanyInstallMonitoringController } from './controllers/pbx-comapany-install-monitoring.controller';
import { PbxFieldModule, PortalCompanyModule } from '@/modules/pbx-domain';
import { ParseFieldExcelModule } from '../shared';
import { ParseCompanyService } from './services/pbx-company-parse.service';
import { PbxCompanySearchService } from './services/pbx-company-search.service';
import { PbxCompanyInstallUseCase } from './use-cases/pbx-company-install.use-case';
import { PbxCompanyInstallController } from './controllers/pbx-comapany-install.controller';
import { PortalEntityFieldInstallService } from './services/portal-field-entity-install.service';

@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalCompanyModule,
        ParseFieldExcelModule,
        PbxFieldModule,
    ],
    controllers: [
        PbxCompanyInstallMonitoringController,
        PbxCompanyInstallController,
    ],
    providers: [
        PbxCompanyMonitoringService,
        ParseCompanyService,
        PbxCompanySearchService,
        PortalEntityFieldInstallService,
        PbxCompanyInstallUseCase,
    ],
})
export class PbxCompanyInstallModule {}
