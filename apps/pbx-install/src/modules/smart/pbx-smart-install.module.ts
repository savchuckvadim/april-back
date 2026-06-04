import { Module } from '@nestjs/common';
import { PbxSmartInstallController } from '@app/pbx-install/smart/controller/pbx-smart-install.controller';
import { PbxSmartParseTemplateController } from '@app/pbx-install/smart/controller/pbx-smart-parse-template.controller';
import { PbxSmartFieldInstallController } from '@app/pbx-install/smart/controller/pbx-smart-field-install.controller';
import { PbxSmartFieldInstallMonitoringController } from '@app/pbx-install/smart/controller/pbx-smart-field-install-monitoring.controller';
import { PbxSmartCategoryInstallController } from '@app/pbx-install/smart/controller/pbx-smart-category-install.controller';
import { PbxSmartCategoryInstallMonitoringController } from '@app/pbx-install/smart/controller/pbx-smart-category-install-monitoring.controller';
import { ParseSmartService } from '@app/pbx-install/smart/services/parse/parse-smart.service';
import { InstallSmartCategoriesService } from './services/smart-categories/install-smart-categories.service';
import { SmartCategoryStageStrategy } from './services/smart-categories/smart-category-stage.strategy';
import { SmartContextResolver } from './services/smart-context.resolver';
import { PbxSmartFieldMonitoringService } from './services/fields/pbx-smart-field-monitoring.service';
import { PbxSmartFieldSearchService } from './services/fields/pbx-smart-field-search.service';
import { PbxSmartCategoryMonitoringService } from './services/categories/pbx-smart-category-monitoring.service';
import { PbxSmartCategorySearchService } from './services/categories/pbx-smart-category-search.service';
import { InstallCategoryModule } from '@app/pbx-install/category/install-category.module';
import { InstallStageModule } from '@app/pbx-install/stage/install-stage.module';
import { InstallTypedEntityModule } from '@app/pbx-install/shared/typed-entity/install-typed-entity.module';
import { PBXModule } from '@/modules/pbx';
import { PortalKonstructorModule } from '@lib/portal-konstructor/portal-konstructor.module';
import { PbxDomainModule } from '@/modules/pbx-domain/pbx-domain.module';
import { DeletePbxSmartUseCase } from '@app/pbx-install/smart/use-cases/delete-pbx-smart.use-case';
import { GetPbxSmartUseCase } from '@app/pbx-install/smart/use-cases/get-pbx-smart.use-case';
import { InstallSmartUseCase } from '@app/pbx-install/smart/use-cases/install-smart.use-case';
import { PbxSmartFieldInstallByParseUseCase } from './use-cases/field/pbx-smart-field-install-by-parse.use-case';
import { PbxSmartFieldInstallByFieldUseCase } from './use-cases/field/pbx-smart-field-install-by-field.use-case';
import { PbxSmartFieldManageUseCase } from './use-cases/field/pbx-smart-field-manage.use-case';
import { PbxSmartCategoryInstallByParseUseCase } from './use-cases/category/pbx-smart-category-install-by-parse.use-case';
import { PbxSmartCategoryInstallByCategoryUseCase } from './use-cases/category/pbx-smart-category-install-by-category.use-case';
import { PbxSmartCategoryManageUseCase } from './use-cases/category/pbx-smart-category-manage.use-case';
import { ParseFieldExcelModule } from '@app/pbx-install/shared/parse-field-excel/parse-field-excel.module';
import { StorageModule } from '@/core/storage/storage.module';

@Module({
    imports: [
        PBXModule,
        StorageModule,
        PortalKonstructorModule,
        PbxDomainModule,
        InstallCategoryModule,
        InstallStageModule,
        InstallTypedEntityModule,
        ParseFieldExcelModule,
    ],
    controllers: [
        PbxSmartInstallController,
        PbxSmartParseTemplateController,
        PbxSmartFieldInstallController,
        PbxSmartFieldInstallMonitoringController,
        PbxSmartCategoryInstallController,
        PbxSmartCategoryInstallMonitoringController,
    ],
    providers: [
        ParseSmartService,
        SmartContextResolver,
        InstallSmartUseCase,
        InstallSmartCategoriesService,
        SmartCategoryStageStrategy,
        PbxSmartFieldMonitoringService,
        PbxSmartFieldSearchService,
        PbxSmartCategoryMonitoringService,
        PbxSmartCategorySearchService,
        PbxSmartFieldInstallByParseUseCase,
        PbxSmartFieldInstallByFieldUseCase,
        PbxSmartFieldManageUseCase,
        PbxSmartCategoryInstallByParseUseCase,
        PbxSmartCategoryInstallByCategoryUseCase,
        PbxSmartCategoryManageUseCase,
        DeletePbxSmartUseCase,
        GetPbxSmartUseCase,
    ],
})
export class PbxSmartInstallModule {}
