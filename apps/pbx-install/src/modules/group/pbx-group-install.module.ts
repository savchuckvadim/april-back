import { Module } from '@nestjs/common';

import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalCallingModule } from '@lib/portal-lib/pbx-domain/portal-calling';

import { PbxGroupInstallController } from './controllers/pbx-group-install.controller';
import { PbxGroupInstallMonitoringController } from './controllers/pbx-group-install-monitoring.controller';
import { PbxGroupInstallUseCase } from './use-cases/pbx-group-install.use-case';
import { PbxGroupMonitoringService } from './services/pbx-group-monitoring.service';

@Module({
    imports: [PBXModule, PortalStoreModule, PortalCallingModule],
    controllers: [
        PbxGroupInstallMonitoringController,
        PbxGroupInstallController,
    ],
    providers: [PbxGroupInstallUseCase, PbxGroupMonitoringService],
})
export class PbxGroupInstallModule {}
