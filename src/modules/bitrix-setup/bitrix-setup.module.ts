import { Module } from '@nestjs/common';
import { BitrixSetupAppModule } from './app/bitrix-setup-app.module';
import { TokenModule } from './token/token.module';
import { SecretModule } from './secret/secret.module';
import { PlacementModule } from './placement/placement.module';
import { SettingModule } from './setting/setting.module';
import { BitrixSetupInstallModule } from './install/bitrix-setup-install.module';
// TODO настройки карточки просмотра
//https://apidocs.bitrix24.com/api-reference/crm/deals/custom-form/index.html
@Module({
    imports: [
        BitrixSetupAppModule,
        TokenModule,
        SecretModule,
        PlacementModule,
        SettingModule,
        BitrixSetupInstallModule,
    ],
    exports: [
        BitrixSetupAppModule,
        TokenModule,
        SecretModule,
        PlacementModule,
        SettingModule,
        BitrixSetupInstallModule,
    ],
})
export class BitrixSetupModule { }
