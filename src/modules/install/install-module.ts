import { Module } from '@nestjs/common';
import { PortalSmartService } from './smart/services/portal-smart.service';
import { PbxSmartController } from './smart/controller/pbx-smart.controller';
import { ParseSmartService } from './smart/services/parse/parse-service';
import { PbxInstallSmartService } from './smart/services/install-to-bx/install.service';
import { PBXModule } from '../pbx';
import { SaveSmartService } from './smart/services/save/save-smart.service';
import { PortalKonstructorModule } from '../portal-konstructor/portal-konstructor.module';
import { SaveSmartFieldsService } from './smart/services/save/save-smart-fields.service';
import { PbxDomainModule } from '../pbx-domain/pbx-domain.module';
import { DeleteSmartUseCase } from './smart/use-cases/delete.use-case';
import { ParseSmartRegistryService } from './smart/services/parse/parse-registry.service';
import { PbxRegistryModule } from '../pbx-registry';

@Module({
    imports: [
        PBXModule,
        PortalKonstructorModule,
        PbxDomainModule,
        PbxRegistryModule,
    ],
    controllers: [PbxSmartController],
    providers: [
        PortalSmartService,
        ParseSmartService,
        ParseSmartRegistryService,
        PbxInstallSmartService,
        SaveSmartService,
        SaveSmartFieldsService,
        DeleteSmartUseCase,
    ],
})
export class PBXInstallModule {}
