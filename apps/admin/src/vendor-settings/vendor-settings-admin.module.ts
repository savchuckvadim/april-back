import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { EgressProxyModule } from '@lib/egress-proxy';
import { VendorSettingsModule } from '@lib/portal-lib/store/vendor-settings/vendor-settings.module';
import { VendorSettingsController } from './vendor-settings.controller';
import { TelegramBotsCatalog } from './services/telegram-bots.catalog';
import { VendorTelegramBotsService } from './services/vendor-telegram-bots.service';
import { VendorTelegramBotTestService } from './services/vendor-telegram-bot-test.service';

/**
 * Админ-роуты настроек вендора (`admin/vendor-settings`) — только в
 * apps/admin, чтобы не торчать в Swagger прикладных приложений
 * (ai/rules/app-api-surface.md). Сервис — из глобального
 * VendorSettingsModule (portal-lib); проверка Telegram-ботов и тестовые
 * сообщения ходят в api.telegram.org через исходящий прокси.
 */
@Module({
    imports: [VendorSettingsModule, HttpModule, EgressProxyModule],
    controllers: [VendorSettingsController],
    providers: [
        TelegramBotsCatalog,
        VendorTelegramBotsService,
        VendorTelegramBotTestService,
    ],
})
export class VendorSettingsAdminModule {}
