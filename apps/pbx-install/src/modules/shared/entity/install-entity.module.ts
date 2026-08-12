import { Module } from '@nestjs/common';

import { PBXModule } from '@/modules/pbx';
import { PbxDomainModule } from '@lib/portal-lib/pbx-domain';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalEntityFieldInstallService } from './field/portal-field-entity-install.service';
import { ParseEntityFieldsService } from './field/parse-entity-field.service';
import { StorageModule } from '@/core/storage';
import { ParseFieldExcelModule } from '../parse-field-excel';

@Module({
    imports: [
        PBXModule,
        PbxDomainModule,
        StorageModule,
        ParseFieldExcelModule,
        // PortalOnlineCacheService: сброс слепка портала после установки полей.
        PortalStoreModule,
    ],
    providers: [PortalEntityFieldInstallService, ParseEntityFieldsService],
    exports: [PortalEntityFieldInstallService, ParseEntityFieldsService],
})
export class InstallEntityModule {}
