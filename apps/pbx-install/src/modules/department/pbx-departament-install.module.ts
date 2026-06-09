import { Module } from '@nestjs/common';

import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalDepartamentModule } from '@lib/portal-lib/pbx-domain/portal-departament';

import { PbxDepartamentInstallController } from './controllers/pbx-departament-install.controller';
import { PbxDepartamentInstallMonitoringController } from './controllers/pbx-departament-install-monitoring.controller';
import { PbxDepartamentInstallUseCase } from './use-cases/pbx-departament-install.use-case';
import { PbxDepartamentMonitoringService } from './services/pbx-departament-monitoring.service';

@Module({
    imports: [PBXModule, PortalStoreModule, PortalDepartamentModule],
    controllers: [
        PbxDepartamentInstallMonitoringController,
        PbxDepartamentInstallController,
    ],
    providers: [PbxDepartamentInstallUseCase, PbxDepartamentMonitoringService],
})
export class PbxDepartamentInstallModule {}
