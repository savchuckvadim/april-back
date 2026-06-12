import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PbxTaskFieldInstallController } from './controllers/pbx-task-field-install.controller';
import { PbxTaskInstallMonitoringController } from './controllers/pbx-task-install-monitoring.controller';
import { PbxTaskParseService } from './services/pbx-task-parse.service';
import { PbxTaskInstallUseCase } from './use-cases/pbx-task-install.use-case';
import { PbxTaskInstallFieldUseCase } from './use-cases/pbx-task-install-field.use-case';
import { PbxTaskFieldManageUseCase } from './use-cases/pbx-task-field-manage.use-case';

/**
 * Модуль установки пользовательских полей ЗАДАЧИ в Bitrix.
 * Только Bitrix (без записи в PortalDB). `PortalStoreModule` нужен лишь для
 * чтения списка порталов при `domain: "all"`.
 */
@Module({
    imports: [PBXModule, PortalStoreModule],
    controllers: [
        PbxTaskFieldInstallController,
        PbxTaskInstallMonitoringController,
    ],
    providers: [
        PbxTaskParseService,
        PbxTaskInstallUseCase,
        PbxTaskInstallFieldUseCase,
        PbxTaskFieldManageUseCase,
    ],
})
export class PbxTaskInstallModule {}
