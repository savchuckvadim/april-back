import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { Module } from '@nestjs/common';
import { PbxContactMonitoringService } from './services/pbx-contact-monitoring.service';
import { PbxContactInstallMonitoringController } from './controllers/pbx-contact-install-monitoring.controller';
import {
    PbxFieldModule,
    PortalContactModule,
} from '@lib/portal-lib/pbx-domain';
import { ParseFieldExcelModule } from '../shared';
// import { ParseContactService } from './services/pbx-contact-parse.service';
import { PbxContactSearchService } from './services/pbx-contact-search.service';
import { PbxContactInstallUseCase } from './use-cases/pbx-contact-install.use-case';
import { PbxContactInstallController } from './controllers/pbx-contact-install.controller';
import { InstallEntityModule } from '../shared/entity/install-entity.module';
import { PbxContactInstallFieldUseCase } from './use-cases/pbx-contact-install-field.use-case';
import { PbxContactFieldManageUseCase } from './use-cases/pbx-contact-field-manage.use-case';

@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalContactModule,
        ParseFieldExcelModule,
        PbxFieldModule,
        InstallEntityModule,
    ],
    controllers: [
        PbxContactInstallMonitoringController,
        PbxContactInstallController,
    ],
    providers: [
        PbxContactMonitoringService,
        // ParseContactService,
        PbxContactSearchService,
        // PortalEntityFieldInstallService,
        PbxContactInstallUseCase,
        PbxContactInstallFieldUseCase,
        PbxContactFieldManageUseCase,
    ],
})
export class PbxContactInstallModule {}
