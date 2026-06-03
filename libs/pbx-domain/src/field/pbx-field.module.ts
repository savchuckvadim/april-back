import { Module } from '@nestjs/common';
import { PbxFieldPrismaRepository } from './repositories/pbx-field.prisma.repository';
import { PbxFieldService } from './services/field/pbx-field.service';
import { PbxFieldRepository } from './repositories/pbx-field.repositry';
import { PbxFieldEntityInstallService } from './services/install/pbx-field-entity-install.service';
import { PbxFieldSmartInstallService } from './services/install/pbx-field-smart-install.service';
import { PbxFieldInstallController } from './controllers/pbx-field.install.controller';
import { PBXModule } from '@/modules/pbx/pbx.module';

@Module({
    imports: [PBXModule],
    controllers: [PbxFieldInstallController],
    providers: [
        {
            provide: PbxFieldRepository,
            useClass: PbxFieldPrismaRepository,
        },
        PbxFieldService,
        PbxFieldEntityInstallService,
        PbxFieldSmartInstallService,
    ],
    exports: [
        PbxFieldService,
        PbxFieldEntityInstallService,
        PbxFieldSmartInstallService,
    ],
})
export class PbxFieldModule {}
