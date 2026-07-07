import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramOriginalService } from './telegram-original.service';

// @Global: TelegramService должен резолвиться optional-inject-ом из
// LoggerModule (Telegram-транспорт логгера), который TelegramModule
// не импортирует. Достаточно импортировать TelegramModule в любом
// модуле приложения.
@Global()
@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TelegramController],
    providers: [TelegramService, TelegramOriginalService],
    exports: [TelegramService],
})
export class TelegramModule {}
