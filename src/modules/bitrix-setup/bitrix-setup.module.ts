import { Module } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { TokenModule } from './token/token.module';
import { SecretModule } from './secret/secret.module';
import { PlacementModule } from './placement/placement.module';
import { SettingModule } from './setting/setting.module';
import { BitrixSetupInstallModule } from './install/bitrix-setup-install.module';

@Module({
    imports: [
        AppModule,
        TokenModule,
        SecretModule,
        PlacementModule,
        SettingModule,
        BitrixSetupInstallModule,
    ],
    exports: [
        AppModule,
        TokenModule,
        SecretModule,
        PlacementModule,
        SettingModule,
        BitrixSetupInstallModule,
    ],
})
export class BitrixSetupModule { }
