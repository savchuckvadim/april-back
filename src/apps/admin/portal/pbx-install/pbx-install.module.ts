import { Module } from '@nestjs/common';
import { PbxInstallController } from './controllers/pbx-install.controller';
import { PbxAdminService } from './services/pbx-admin.service';
import { PbxTestService } from './services/pbx-test.service';
import { PbxRegistryModule } from '@/modules/pbx-registry';
import { PBXModule } from '@/modules/pbx/pbx.module';

@Module({
    imports: [PbxRegistryModule, PBXModule],
    controllers: [PbxInstallController],
    providers: [PbxAdminService, PbxTestService],
})
export class PbxInstallModule {}
