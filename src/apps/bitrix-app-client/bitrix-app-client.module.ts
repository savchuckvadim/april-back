import { Module } from '@nestjs/common';
import { BitrixSetupModule } from '@/modules/bitrix-setup/bitrix-setup.module';
import { BitrixAppClientController } from './controllers/bitrix-app-client.controller';
import { BitrixAppClientService } from './services/bitrix-app-client.service';

@Module({
    imports: [BitrixSetupModule],
    controllers: [BitrixAppClientController],
    providers: [BitrixAppClientService],
    
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
