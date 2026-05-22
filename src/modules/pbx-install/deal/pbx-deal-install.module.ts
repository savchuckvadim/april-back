import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@/modules/portal-konstructor/portal/portal-store.module';
import { Module } from '@nestjs/common';
import { PbxDealCategoryInstallMonitoringController } from './controllers/pbx-deal-category-install-monitoring.controller';
import {
    PbxFieldModule,
    PortalCategoryModule,
    PortalDealModule,
} from '@/modules/pbx-domain';
import { ParseFieldExcelModule } from '../shared';

import { PbxDealFieldInstallByParseUseCase } from './use-cases/field/pbx-deal-field-install-by-parse.use-case';
import { InstallEntityModule } from '../shared/entity/install-entity.module';
import { PbxDealFieldInstallByFieldUseCase } from './use-cases/field/pbx-deal-field-install-by-field.use-case';
import { PbxDealFieldManageUseCase } from './use-cases/field/pbx-deal-field-manage.use-case';
import { PbxDealMonitoringService } from './services/fields/pbx-deal-monitoring.service';
import { PbxDealSearchService } from './services/fields/pbx-deal-search.service';
import { ParseCategoryService } from './services/categories/parse-category.service';
import { PbxDealCategoryMonitoringService } from './services/categories/pbx-deal-category-monitoring.service';
import { PbxDealCategorySearchService } from './services/categories/pbx-deal-category-search.service';
import { DealCategoryStageStrategy } from './services/categories/deal-category-stage.strategy';
import { InstallDealCategoriesService } from './services/categories/install-deal-categories.service';
import { PbxDealFieldInstallMonitoringController } from './controllers/pbx-deal-field-install-monitoring.controller';
import { PbxDealFieldInstallController } from './controllers/pbx-deal-field-install.controller';
import { PbxDealCategoryInstallController } from './controllers/pbx-deal-category-install.controller';
import { PbxDealCategoryInstallByParseUseCase } from './use-cases/category/pbx-deal-category-install-by-parse.use-case';
import { PbxDealCategoryInstallByCategoryUseCase } from './use-cases/category/pbx-deal-category-install-by-category.use-case';
import { PbxDealCategoryManageUseCase } from './use-cases/category/pbx-deal-category-manage.use-case';
import { InstallCategoryModule } from '../category';
import { InstallStageModule } from '../stage';

@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalDealModule,
        PortalCategoryModule,
        ParseFieldExcelModule,
        PbxFieldModule,
        InstallEntityModule,
        InstallCategoryModule,
        InstallStageModule,
    ],
    controllers: [
        PbxDealFieldInstallMonitoringController,
        PbxDealCategoryInstallMonitoringController,
        PbxDealFieldInstallController,
        PbxDealCategoryInstallController,
    ],
    providers: [
        ParseCategoryService,
        PbxDealMonitoringService,
        PbxDealSearchService,
        PbxDealCategoryMonitoringService,
        PbxDealCategorySearchService,
        DealCategoryStageStrategy,
        InstallDealCategoriesService,
        PbxDealFieldInstallByParseUseCase,
        PbxDealFieldInstallByFieldUseCase,
        PbxDealFieldManageUseCase,
        PbxDealCategoryInstallByParseUseCase,
        PbxDealCategoryInstallByCategoryUseCase,
        PbxDealCategoryManageUseCase,
    ],
})
export class PbxDealInstallModule { }
