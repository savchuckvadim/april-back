import { Module } from '@nestjs/common';
import { CabinetModule } from './cabinet.module';
import { CabinetAuthController } from './controllers/cabinet-auth.controller';
import { CabinetPortalsController } from './controllers/cabinet-portals.controller';
import { CabinetMembersController } from './controllers/cabinet-members.controller';
import { CabinetFrameController } from './controllers/cabinet-frame.controller';
import { CabinetTelegramController } from './controllers/cabinet-telegram.controller';
import { CabinetAdminController } from './admin/cabinet-admin.controller';
import { CabinetGuideAdminController } from './admin/cabinet-guide.admin.controller';
import { CabinetGuideService } from './guide/cabinet-guide.service';
import { ClientTelegramWebhookController } from './telegram/webhook/client-telegram-webhook.controller';
import { ClientTelegramWebhookGuard } from './telegram/webhook/client-telegram-webhook.guard';
import { ClientTelegramWebhookRegistrar } from './telegram/webhook/client-telegram-webhook.registrar';

/** Ручки кабинета для клиента (сайт и фрейм) — подключается в apps/pbx. */
@Module({
    imports: [CabinetModule],
    controllers: [
        CabinetAuthController,
        CabinetPortalsController,
        CabinetMembersController,
        CabinetFrameController,
        CabinetTelegramController,
    ],
})
export class CabinetApiModule {}

/**
 * Ручки кабинета для администратора April (`admin/cabinet/*`,
 * @Roles(SUPER_USER)) и путеводитель — подключается ТОЛЬКО в apps/admin.
 */
@Module({
    imports: [CabinetModule],
    controllers: [CabinetAdminController, CabinetGuideAdminController],
    providers: [CabinetGuideService],
})
export class CabinetAdminModule {}

/**
 * Вебхук клиентского Telegram-бота + регистрация вебхука при старте —
 * подключается в apps/bot (каналы общения с пользователями).
 */
@Module({
    imports: [CabinetModule],
    controllers: [ClientTelegramWebhookController],
    providers: [ClientTelegramWebhookGuard, ClientTelegramWebhookRegistrar],
})
export class CabinetTelegramWebhookModule {}
