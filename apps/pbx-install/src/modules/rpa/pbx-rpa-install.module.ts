import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { StorageModule } from '@/core/storage/storage.module';
import { PbxDomainModule } from '@lib/portal-lib/pbx-domain/pbx-domain.module';
import { InstallTypedEntityModule } from '@app/pbx-install/shared/typed-entity/install-typed-entity.module';
import { PbxRpaInstallController } from './controller/pbx-rpa-install.controller';
import { PbxRpaParseTemplateController } from './controller/pbx-rpa-parse-template.controller';
import { PbxRpaFieldInstallController } from './controller/pbx-rpa-field-install.controller';
import { PbxRpaFieldInstallMonitoringController } from './controller/pbx-rpa-field-install-monitoring.controller';
import { PbxRpaCategoryInstallController } from './controller/pbx-rpa-category-install.controller';
import { PbxRpaCategoryInstallMonitoringController } from './controller/pbx-rpa-category-install-monitoring.controller';
import { ParseRpaService } from './services/parse/parse-rpa.service';
import { RpaContextResolver } from './services/rpa-context.resolver';
import { InstallRpaCategoriesService } from './services/rpa-categories/install-rpa-categories.service';
import { PbxRpaFieldMonitoringService } from './services/fields/pbx-rpa-field-monitoring.service';
import { PbxRpaFieldSearchService } from './services/fields/pbx-rpa-field-search.service';
import { PbxRpaCategoryMonitoringService } from './services/categories/pbx-rpa-category-monitoring.service';
import { PbxRpaCategorySearchService } from './services/categories/pbx-rpa-category-search.service';
import { InstallRpaUseCase } from './use-cases/install-rpa.use-case';
import { GetPbxRpaUseCase } from './use-cases/get-pbx-rpa.use-case';
import { DeletePbxRpaUseCase } from './use-cases/delete-pbx-rpa.use-case';
import { PbxRpaFieldInstallByParseUseCase } from './use-cases/field/pbx-rpa-field-install-by-parse.use-case';
import { PbxRpaFieldInstallByFieldUseCase } from './use-cases/field/pbx-rpa-field-install-by-field.use-case';
import { PbxRpaFieldManageUseCase } from './use-cases/field/pbx-rpa-field-manage.use-case';
import { PbxRpaCategoryInstallByParseUseCase } from './use-cases/category/pbx-rpa-category-install-by-parse.use-case';
import { PbxRpaCategoryInstallByCategoryUseCase } from './use-cases/category/pbx-rpa-category-install-by-category.use-case';
import { PbxRpaCategoryManageUseCase } from './use-cases/category/pbx-rpa-category-manage.use-case';

@Module({
    imports: [
        PBXModule,
        StorageModule,
        PbxDomainModule,
        InstallTypedEntityModule,
    ],
    controllers: [
        PbxRpaInstallController,
        PbxRpaParseTemplateController,
        PbxRpaFieldInstallController,
        PbxRpaFieldInstallMonitoringController,
        PbxRpaCategoryInstallController,
        PbxRpaCategoryInstallMonitoringController,
    ],
    providers: [
        ParseRpaService,
        RpaContextResolver,
        InstallRpaCategoriesService,
        PbxRpaFieldMonitoringService,
        PbxRpaFieldSearchService,
        PbxRpaCategoryMonitoringService,
        PbxRpaCategorySearchService,
        InstallRpaUseCase,
        GetPbxRpaUseCase,
        DeletePbxRpaUseCase,
        PbxRpaFieldInstallByParseUseCase,
        PbxRpaFieldInstallByFieldUseCase,
        PbxRpaFieldManageUseCase,
        PbxRpaCategoryInstallByParseUseCase,
        PbxRpaCategoryInstallByCategoryUseCase,
        PbxRpaCategoryManageUseCase,
    ],
})
export class PbxRpaInstallModule {}
