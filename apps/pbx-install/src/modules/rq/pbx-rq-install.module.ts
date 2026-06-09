import { Module } from '@nestjs/common';

import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalRqModule } from '@lib/portal-lib/pbx-domain/portal-rq';

import { PbxRqInstallController } from './controllers/pbx-rq-install.controller';
import { PbxRqInstallMonitoringController } from './controllers/pbx-rq-install-monitoring.controller';
import { PbxRqManageController } from './controllers/pbx-rq-manage.controller';
import { InstallRqUseCase } from './use-cases/install-rq.use-case';
import { RqMonitoringUseCase } from './use-cases/rq-monitoring.use-case';
import { RqManageUseCase } from './use-cases/rq-manage.use-case';
import { InstallRqPresetSyncService } from './services/install-rq-preset-sync.service';
import { InstallRqFieldSyncService } from './services/install-rq-field-sync.service';

/**
 * Установка/синхронизация реквизитной части портала:
 * пресеты `crm.requisite.preset.*` (+ зеркало `bx_rqs`) и поля
 * `crm.requisite.userfield.*`. Три глагола: Monitoring / Install / Manage.
 */
@Module({
    imports: [PBXModule, PortalStoreModule, PortalRqModule],
    controllers: [
        PbxRqInstallMonitoringController,
        PbxRqInstallController,
        PbxRqManageController,
    ],
    providers: [
        InstallRqUseCase,
        RqMonitoringUseCase,
        RqManageUseCase,
        InstallRqPresetSyncService,
        InstallRqFieldSyncService,
    ],
})
export class PbxRqInstallModule {}
