import { Module } from '@nestjs/common';
import { PbxCompanyInstallModule } from './company/pbx-company-install.module';
import { PbxDealInstallModule } from './deal/pbx-deal-install.module';
import { PbxSmartInstallModule } from './smart/pbx-smart-install.module';

@Module({
    imports: [PbxSmartInstallModule, PbxCompanyInstallModule, PbxDealInstallModule],
    exports: [PbxSmartInstallModule, PbxCompanyInstallModule, PbxDealInstallModule],
})
export class PBXInstallModule {}
