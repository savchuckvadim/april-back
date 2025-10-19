import { Module } from '@nestjs/common';
import { BitrixSetupModule } from '@/modules/bitrix-setup/bitrix-setup.module';
import { BitrixAppClientController } from './controllers/bitrix-app-client.controller';
import { BitrixAppClientService } from './services/bitrix-app-client.service';
import { UserModule } from '../user/user.module';
import { ClientModule } from '../client/client.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        BitrixSetupModule,
        UserModule,
        ClientModule,
        AuthModule,
    ],
    controllers: [BitrixAppClientController],
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
