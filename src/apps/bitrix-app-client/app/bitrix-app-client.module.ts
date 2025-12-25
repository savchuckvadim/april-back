import { Module } from '@nestjs/common';
import { BitrixSetupModule } from '@/modules/bitrix-setup/bitrix-setup.module';
import { BitrixAppClientController } from './controllers/bitrix-app-client.controller';
import { BitrixAppClientService } from './services/bitrix-app-client.service';
import { UserModule } from '../user/user.module';
import { ClientModule } from '../client/client.module';
import { AuthModule } from '../auth/auth.module';
import { BitrixAppUiController } from './controllers/bitrix-app-ui.controller';
import { BitrixSetupAppModule } from '@/modules/bitrix-setup/app/bitrix-setup-app.module';
import { PortalStoreModule } from '@/modules/portal-konstructor/portal/portal-store.module';
import { CookieModule } from '@/core/cookie/cookie.module';
import { BitrixAppInstallController } from './controllers/bitrix-app-install.controller';
import { PBXModule } from '@/modules/pbx';

@Module({
    imports: [
        BitrixSetupModule,
        UserModule,
        ClientModule,
        AuthModule,
        BitrixSetupAppModule,
        PortalStoreModule,
        CookieModule,
        PBXModule,
    ],
    controllers: [BitrixAppClientController, BitrixAppUiController, BitrixAppInstallController],
    providers: [BitrixAppClientService],
    exports: [
        UserModule,
        ClientModule,
        AuthModule,
    ],
})

export class BitrixAppClientModule { }

/**
 * Bitrix App Client Module
 *  установка новго приложения и переустановка основных токенов приложения
 *  установка / обновление секретов приложения

 *  установка / обновление настроек приложения
 *  установка / обновление токенов приложения
 *  установка / обновление секретов приложения
 *  установка / обновление модулей приложения
 *           placement
 *           entities
             fields ...
             rqs
 управление настройками и параметрами модулей приложения
 */
