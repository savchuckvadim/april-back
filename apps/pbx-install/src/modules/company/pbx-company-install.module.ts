import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { Module } from '@nestjs/common';
import { PbxCompanyMonitoringService } from './services/pbx-company-monitoring.service';
import { PbxCompanyInstallMonitoringController } from './controllers/pbx-comapany-install-monitoring.controller';
import {
    PbxFieldModule,
    PortalCompanyModule,
} from '@lib/portal-lib/pbx-domain';
import { ParseFieldExcelModule } from '../shared';
// import { ParseCompanyService } from './services/pbx-company-parse.service';
import { PbxCompanySearchService } from './services/pbx-company-search.service';
import { PbxCompanyInstallUseCase } from './use-cases/pbx-company-install.use-case';
import { PbxCompanyInstallController } from './controllers/pbx-comapany-install.controller';
import { InstallEntityModule } from '../shared/entity/install-entity.module';
import { PbxCompanyInstallFieldUseCase } from './use-cases/pbx-company-install-field.use-case';
import { PbxCompanyFieldManageUseCase } from './use-cases/pbx-company-field-manage.use-case';

@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalCompanyModule,
        ParseFieldExcelModule,
        PbxFieldModule,
        InstallEntityModule,
    ],
    controllers: [
        PbxCompanyInstallMonitoringController,
        PbxCompanyInstallController,
    ],
    providers: [
        PbxCompanyMonitoringService,
        // ParseCompanyService,
        PbxCompanySearchService,
        // PortalEntityFieldInstallService,
        PbxCompanyInstallUseCase,
        PbxCompanyInstallFieldUseCase,
        PbxCompanyFieldManageUseCase,
    ],
})
export class PbxCompanyInstallModule {}
