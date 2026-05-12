import { Module } from '@nestjs/common';
import { PbxCompanyInstallModule } from './company/pbx-company-install.module';
import { PbxSmartInstallModule } from './smart/pbx-smart-install.module';

@Module({
    imports: [PbxSmartInstallModule, PbxCompanyInstallModule],
    exports: [PbxSmartInstallModule, PbxCompanyInstallModule],
})
export class PBXInstallModule {}
