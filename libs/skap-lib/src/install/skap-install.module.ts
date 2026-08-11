import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PbxSkapSmartModule } from '@lib/portal-lib/pbx/pbx-skap-smart';
import { InstallSkapSmartUseCase } from './install-skap-smart.use-case';

/**
 * Установка смарта «СКАП» на портал (идемпотентно, из const-конфига).
 * Потребители: admin (ConstSmartInstallerResolver), event-service.
 */
@Module({
    imports: [
        PBXModule,
        PortalSmartModule,
        PortalStoreModule,
        PbxSkapSmartModule,
    ],
    providers: [InstallSkapSmartUseCase],
    exports: [InstallSkapSmartUseCase],
})
export class SkapInstallModule {}
