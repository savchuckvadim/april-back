import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EgressProxyModule } from '@lib/egress-proxy';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramOriginalService } from './telegram-original.service';

// @Global: TelegramService должен резолвиться optional-inject-ом из
// LoggerModule (Telegram-транспорт логгера), который TelegramModule
// не импортирует. Достаточно импортировать TelegramModule в любом
// модуле приложения.
@Global()
@Module({
    // EgressProxyModule — api.telegram.org через исходящий прокси, если он
    // настроен в env (EGRESS_PROXY_*); без настройки отправка прежняя.
    imports: [HttpModule, ConfigModule, EgressProxyModule],
    controllers: [TelegramController],
    providers: [TelegramService, TelegramOriginalService],
    exports: [TelegramService],
})
export class TelegramModule {}
