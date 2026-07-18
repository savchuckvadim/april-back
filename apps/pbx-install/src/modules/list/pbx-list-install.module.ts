import { Module } from '@nestjs/common';
import { StorageModule } from '@/core/storage';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalListModule } from '@lib/portal-lib/pbx-domain/portal-list';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PbxListParseTemplateController } from './controllers/pbx-list-parse-template.controller';
import { PbxListInstallController } from './controllers/pbx-list-install.controller';
import { PbxListInstallMonitoringController } from './controllers/pbx-list-install-monitoring.controller';
import { PbxListFieldInstallController } from './controllers/pbx-list-field-install.controller';
import { PbxListFieldInstallMonitoringController } from './controllers/pbx-list-field-install-monitoring.controller';
import { ParseListService } from './services/parse/parse-list.service';
import { ParseListFieldsService } from './services/parse/parse-list-fields.service';
import { ListContextResolver } from './services/list-context.resolver';
import { PortalListFieldInstallService } from './services/install/portal-list-field-install.service';
import { PbxListFieldMonitoringService } from './services/monitoring/pbx-list-field-monitoring.service';
import { PbxListSearchService } from './services/monitoring/pbx-list-search.service';
import { InstallListUseCase } from './use-cases/install-list.use-case';
import { ListMonitoringUseCase } from './use-cases/list-monitoring.use-case';
import { GetPbxListUseCase } from './use-cases/get-pbx-list.use-case';
import { DeletePbxListUseCase } from './use-cases/delete-pbx-list.use-case';
import { PbxListFieldInstallByParseUseCase } from './use-cases/field/pbx-list-field-install-by-parse.use-case';
import { PbxListFieldInstallByFieldUseCase } from './use-cases/field/pbx-list-field-install-by-field.use-case';
import { PbxListFieldManageUseCase } from './use-cases/field/pbx-list-field-manage.use-case';

/**
 * Установка и синхронизация универсальных списков Bitrix
 * (Excel-шаблон → Bitrix `lists.*` → PortalDB `bitrixlists`/`bitrixfields`).
 *
 * Bx-инсталлеры (BxListInstallService, BxListFieldsInstallService,
 * BxListFieldManageService) сознательно НЕ провайдеры — создаются через `new`
 * в use-case-ах с конкретным domain (правило CLAUDE.md про race condition).
 */
@Module({
    imports: [
        StorageModule,
        PBXModule,
        PortalStoreModule,
        PortalListModule,
        PbxFieldModule,
    ],
    providers: [
        ParseListService,
        ParseListFieldsService,
        ListContextResolver,
        PortalListFieldInstallService,
        PbxListFieldMonitoringService,
        PbxListSearchService,
        InstallListUseCase,
        ListMonitoringUseCase,
        GetPbxListUseCase,
        DeletePbxListUseCase,
        PbxListFieldInstallByParseUseCase,
        PbxListFieldInstallByFieldUseCase,
        PbxListFieldManageUseCase,
    ],
    controllers: [
        PbxListParseTemplateController,
        PbxListInstallController,
        PbxListInstallMonitoringController,
        PbxListFieldInstallController,
        PbxListFieldInstallMonitoringController,
    ],
    // экспорт для воркера marketplace-provision
    exports: [InstallListUseCase],
})
export class PbxListInstallModule {}
