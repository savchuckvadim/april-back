import { Module } from '@nestjs/common';
import { PbxFieldModule } from './field/pbx-field.module';
import { PbxUserModule } from './user/pbx-user.module';

@Module({
    imports: [PbxFieldModule, PbxUserModule],
    exports: [PbxFieldModule, PbxUserModule],
})
export class PbxDomainModule {}
