import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PbxFieldModule, PbxUserModule } from '@lib/portal-lib/pbx-domain';
import { InstallEntityModule } from '../shared/entity/install-entity.module';
import { PbxUserFieldInstallController } from './controllers/pbx-user-field-install.controller';
import { PbxUserParseService } from './services/pbx-user-parse.service';
import { PbxUserEntityService } from './services/pbx-user-entity.service';
import { PbxUserInstallUseCase } from './use-cases/pbx-user-install.use-case';
import { PbxUserInstallFieldUseCase } from './use-cases/pbx-user-install-field.use-case';
import { PbxUserFieldManageUseCase } from './use-cases/pbx-user-field-manage.use-case';

/**
 * Модуль установки пользовательских полей ПОЛЬЗОВАТЕЛЯ в Bitrix
 * с синхронизацией в PortalDB (сущность USER / BtxUser).
 */
@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PbxFieldModule,
        PbxUserModule,
        InstallEntityModule,
    ],
    controllers: [PbxUserFieldInstallController],
    providers: [
        PbxUserParseService,
        PbxUserEntityService,
        PbxUserInstallUseCase,
        PbxUserInstallFieldUseCase,
        PbxUserFieldManageUseCase,
    ],
})
export class PbxUserInstallModule {}
