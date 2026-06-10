import { Module } from '@nestjs/common';
import { PbxCompanyInstallModule } from './company/pbx-company-install.module';
import { PbxDealInstallModule } from './deal/pbx-deal-install.module';
import { PbxSmartInstallModule } from './smart/pbx-smart-install.module';
import { PbxRpaInstallModule } from './rpa/pbx-rpa-install.module';
import { PbxListInstallModule } from './list/pbx-list-install.module';
import { PbxGroupInstallModule } from './group/pbx-group-install.module';
import { PbxDepartamentInstallModule } from './department/pbx-departament-install.module';
import { PbxRqInstallModule } from './rq/pbx-rq-install.module';
import { PbxTaskInstallModule } from './task/pbx-task-install.module';
import { PbxUserInstallModule } from './user/pbx-user-install.module';
import { PortalStoreModule } from '@lib/portal-lib';

@Module({
    imports: [
        PbxSmartInstallModule,
        PbxRpaInstallModule,
        PbxCompanyInstallModule,
        PbxDealInstallModule,
        PbxListInstallModule,
        PbxGroupInstallModule,
        PbxDepartamentInstallModule,
        PbxRqInstallModule,
        PbxTaskInstallModule,
        PbxUserInstallModule,
        PortalStoreModule,
    ],
    exports: [
        PbxSmartInstallModule,
        PbxRpaInstallModule,
        PbxCompanyInstallModule,
        PbxDealInstallModule,
        PbxListInstallModule,
        PbxGroupInstallModule,
        PbxDepartamentInstallModule,
        PbxRqInstallModule,
        PbxTaskInstallModule,
        PbxUserInstallModule,
    ],
})
export class PBXInstallModule {}
