import { Module } from '@nestjs/common';
import { PbxCompanyInstallModule } from './company/pbx-company-install.module';
import { PbxDealInstallModule } from './deal/pbx-deal-install.module';
import { PbxSmartInstallModule } from './smart/pbx-smart-install.module';
import { PbxListInstallModule } from './list/pbx-list-install.module';

@Module({
    imports: [
        PbxSmartInstallModule,
        PbxCompanyInstallModule,
        PbxDealInstallModule,
        PbxListInstallModule,
    ],
    exports: [
        PbxSmartInstallModule,
        PbxCompanyInstallModule,
        PbxDealInstallModule,
        PbxListInstallModule,
    ],
})
export class PBXInstallModule {}
