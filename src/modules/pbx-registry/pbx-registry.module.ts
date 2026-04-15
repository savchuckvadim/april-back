import { Module } from '@nestjs/common';
import { StorageModule } from '@/core/storage/storage.module';
import { PbxRegistryService } from './services/pbx-registry.service';
import { PbxResolverService } from './services/pbx-resolver.service';
import { PbxRegistryBootstrapService } from './services/pbx-registry-bootstrap.service';
import { PbxEntityAccessorService } from './services/pbx-entity-accessor.service';
import { PbxFieldInstallerService } from './services/installers/pbx-field-installer.service';
import { PbxCategoryInstallerService } from './services/installers/pbx-category-installer.service';
import { PbxInstallOrchestratorService } from './services/installers/pbx-install-orchestrator.service';

@Module({
    imports: [StorageModule],
    providers: [
        PbxRegistryService,
        PbxResolverService,
        PbxRegistryBootstrapService,
        PbxEntityAccessorService,
        PbxFieldInstallerService,
        PbxCategoryInstallerService,
        PbxInstallOrchestratorService,
    ],
    exports: [
        PbxRegistryService,
        PbxResolverService,
        PbxEntityAccessorService,
        PbxFieldInstallerService,
        PbxCategoryInstallerService,
        PbxInstallOrchestratorService,
    ],
})
export class PbxRegistryModule {}
