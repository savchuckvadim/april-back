import { Module } from '@nestjs/common';
import { PbxInstallController } from './controllers/pbx-install.controller';
import { PbxRegistryModule } from '@/modules/pbx-registry';

@Module({
    imports: [PbxRegistryModule],
    controllers: [PbxInstallController],
})
export class PbxInstallModule {}
