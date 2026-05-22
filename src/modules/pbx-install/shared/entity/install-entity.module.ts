import { Module } from '@nestjs/common';

import { PBXModule } from '@/modules/pbx';
import { PbxDomainModule } from '@/modules/pbx-domain';
import { PortalEntityFieldInstallService } from './field/portal-field-entity-install.service';
import { ParseEntityFieldsService } from './field/parse-entity-field.service';
import { StorageModule } from '@/core/storage';
import { ParseFieldExcelModule } from '../parse-field-excel';

@Module({
    imports: [
        PBXModule,
        PbxDomainModule,
        StorageModule,
        ParseFieldExcelModule

    ],
    providers: [
        PortalEntityFieldInstallService,
        ParseEntityFieldsService
    ],
    exports: [
        PortalEntityFieldInstallService,
        ParseEntityFieldsService
    ]

})
export class InstallEntityModule { }
