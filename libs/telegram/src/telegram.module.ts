import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EgressProxyModule } from '@lib/egress-proxy';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';

/**
 * Единственный Telegram-отправитель монорепо. @Global: TelegramService
 * должен резолвиться optional-inject-ом из LoggerModule (Telegram-транспорт
 * логгера), который TelegramModule не импортирует — достаточно
 * импортировать TelegramModule в любом модуле приложения.
 *
 * EgressProxyModule обязателен: api.telegram.org с российских серверов
 * доступен только через исходящий прокси. Модуль, который заводит
 * TelegramService своим провайдером (маркетплейс), обязан импортировать
 * EgressProxyModule сам — иначе приложение не поднимется, и это правильно:
 * тихая отправка мимо прокси = потерянные тревоги.
 */
@Global()
@Module({
    imports: [HttpModule, ConfigModule, EgressProxyModule],
    controllers: [TelegramController],
    providers: [TelegramService],
    exports: [TelegramService],
})
export class TelegramModule {}
