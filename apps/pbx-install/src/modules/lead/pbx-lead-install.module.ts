import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import {
    PbxFieldModule,
    PortalCategoryModule,
    PortalLeadModule,
} from '@lib/portal-lib/pbx-domain';
import { ParseFieldExcelModule } from '../shared';
import { InstallEntityModule } from '../shared/entity/install-entity.module';

import { PbxLeadMonitoringService } from './services/fields/pbx-lead-monitoring.service';
import { PbxLeadSearchService } from './services/fields/pbx-lead-search.service';
import { PbxLeadFieldInstallByParseUseCase } from './use-cases/field/pbx-lead-field-install-by-parse.use-case';
import { PbxLeadFieldInstallByFieldUseCase } from './use-cases/field/pbx-lead-field-install-by-field.use-case';
import { PbxLeadFieldManageUseCase } from './use-cases/field/pbx-lead-field-manage.use-case';
import { PbxLeadFieldInstallController } from './controllers/pbx-lead-field-install.controller';
import { PbxLeadFieldInstallMonitoringController } from './controllers/pbx-lead-field-install-monitoring.controller';
import { PbxLeadFieldBitrixController } from './controllers/pbx-lead-field-bitrix.controller';
import { PbxLeadFieldBitrixUseCase } from './use-cases/field/pbx-lead-field-bitrix.use-case';

import { EnsureLeadCategoryService } from './services/stages/ensure-lead-category.service';
import { PbxLeadStageMonitoringService } from './services/stages/pbx-lead-stage-monitoring.service';
import { InstallLeadStageSyncService } from './services/stages/install-lead-stage-sync.service';
import { MapLeadStagesUseCase } from './use-cases/stage/map-lead-stages.use-case';
import { InstallLeadStagesUseCase } from './use-cases/stage/install-lead-stages.use-case';
import { PbxLeadStageInstallController } from './controllers/pbx-lead-stage-install.controller';
import { PbxLeadStageInstallMonitoringController } from './controllers/pbx-lead-stage-install-monitoring.controller';

@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalLeadModule,
        PortalCategoryModule,
        ParseFieldExcelModule,
        PbxFieldModule,
        InstallEntityModule,
    ],
    controllers: [
        PbxLeadFieldInstallMonitoringController,
        PbxLeadFieldInstallController,
        PbxLeadFieldBitrixController,
        PbxLeadStageInstallMonitoringController,
        PbxLeadStageInstallController,
    ],
    providers: [
        PbxLeadMonitoringService,
        PbxLeadFieldBitrixUseCase,
        PbxLeadSearchService,
        PbxLeadFieldInstallByParseUseCase,
        PbxLeadFieldInstallByFieldUseCase,
        PbxLeadFieldManageUseCase,
        EnsureLeadCategoryService,
        PbxLeadStageMonitoringService,
        InstallLeadStageSyncService,
        MapLeadStagesUseCase,
        InstallLeadStagesUseCase,
    ],
    // экспорт для воркера marketplace-provision
    exports: [PbxLeadFieldInstallByParseUseCase],
})
export class PbxLeadInstallModule {}
