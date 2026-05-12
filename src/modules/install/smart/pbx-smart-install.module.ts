import { Module } from '@nestjs/common';
import { PbxSmartInstallController } from '@/modules/install/smart/controller/pbx-smart-install.controller';
import { ParseSmartService } from '@/modules/install/smart/services/parse/parse-service';
import { InstallSmartCategoriesService } from './services/smart-categories/install-smart-categories.service';
import { InstallCategoryModule } from '@/modules/install/category/install-category.module';
import { InstallStageModule } from '@/modules/install/stage/install-stage.module';
import { PBXModule } from '@/modules/pbx';
import { PortalKonstructorModule } from '@/modules/portal-konstructor/portal-konstructor.module';
import { SaveSmartFieldsService } from '@/modules/install/smart/services/smart-fields/save-smart-fields.service';
import { PbxDomainModule } from '@/modules/pbx-domain/pbx-domain.module';
import { DeletePbxSmartUseCase } from '@/modules/install/smart/use-cases/delete-pbx-smart.use-case';
import { ParseSmartRegistryService } from '@/modules/install/smart/services/parse/parse-registry.service';
import { PbxRegistryModule } from '@/modules/pbx-registry';
import { PbxSmartParseTemplateController } from '@/modules/install/smart/controller/pbx-smart-parse-template.controller';
import { GetPbxSmartUseCase } from '@/modules/install/smart/use-cases/get-pbx-smart.use-case';
import { InstallSmartUseCase } from '@/modules/install/smart/use-cases/install-smart.use-case';
import { ParseFieldExcelModule } from '@/modules/install/shared/parse-field-excel/parse-field-excel.module';
import { StorageModule } from '@/core/storage/storage.module';

@Module({
    imports: [
        PBXModule,
        StorageModule,
        PortalKonstructorModule,
        PbxDomainModule,
        PbxRegistryModule,
        InstallCategoryModule,
        InstallStageModule,
        ParseFieldExcelModule,
    ],
    controllers: [PbxSmartInstallController, PbxSmartParseTemplateController],
    providers: [
        ParseSmartService,
        ParseSmartRegistryService,
        InstallSmartUseCase,
        InstallSmartCategoriesService,
        SaveSmartFieldsService,
        DeletePbxSmartUseCase,
        GetPbxSmartUseCase,
    ],
})
export class PbxSmartInstallModule {}
