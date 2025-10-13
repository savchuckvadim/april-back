import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TelegramController],
    providers: [TelegramService],
    exports: [TelegramService],
})
export class TelegramModule {}
