import { Module } from '@nestjs/common';
import { PbxFieldPrismaRepository } from './pbx-field.prisma.repository';
import { PbxFieldService } from './pbx-field.service';
import { PbxFieldRepository } from './pbx-field.repositry';
import { PbxFieldEntityInstallService } from './services/pbx-field-entity-install.service';
import { PbxFieldSmartInstallService } from './services/pbx-field-smart-install.service';
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
export class PbxFieldModule { }
