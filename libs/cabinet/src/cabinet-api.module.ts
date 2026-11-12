import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MarketplaceCoreModule } from '@lib/marketplace-core';
import { CabinetModule } from './cabinet.module';
import { CabinetAuthController } from './controllers/cabinet-auth.controller';
import { CabinetPortalsController } from './controllers/cabinet-portals.controller';
import { CabinetMembersController } from './controllers/cabinet-members.controller';
import { CabinetFrameController } from './controllers/cabinet-frame.controller';
import { CabinetTelegramController } from './controllers/cabinet-telegram.controller';
import { CabinetBitrixAppController } from './controllers/cabinet-bitrix-app.controller';
import { CabinetAdminController } from './admin/cabinet-admin.controller';
import { CabinetBitrixAppAdminController } from './admin/cabinet-bitrix-app.admin.controller';
import { CabinetChecksAdminController } from './admin/cabinet-checks.admin.controller';
import { CabinetMailCheckService } from './admin/cabinet-mail-check.service';
import { SmtpNetworkProbe } from './infrastructure/smtp-network.probe';
import { CabinetGuideAdminController } from './admin/cabinet-guide.admin.controller';
import { CabinetOrganizationAdminController } from './admin/cabinet-organization.admin.controller';
import { CabinetGuideService } from './guide/cabinet-guide.service';
import { CabinetCorsProbe } from './guide/cabinet-cors.probe';
import { ClientTelegramWebhookController } from './telegram/webhook/client-telegram-webhook.controller';
import { ClientTelegramWebhookGuard } from './telegram/webhook/client-telegram-webhook.guard';
import { ClientTelegramWebhookRegistrar } from './telegram/webhook/client-telegram-webhook.registrar';

/**
 * Ручки кабинета для клиента (сайт и фрейм) — подключается в apps/pbx.
 * MarketplaceCoreModule — «Подключение Битрикс24» (ключи локального
 * приложения и их проверка).
 */
@Module({
    imports: [CabinetModule, MarketplaceCoreModule],
    controllers: [
        CabinetAuthController,
        CabinetPortalsController,
        CabinetMembersController,
        CabinetFrameController,
        CabinetTelegramController,
        CabinetBitrixAppController,
    ],
})
export class CabinetApiModule {}

/**
 * Ручки кабинета для администратора April (`admin/cabinet/*`,
 * @Roles(SUPER_USER)), подключение Битрикс24 и путеводитель — подключается
 * ТОЛЬКО в apps/admin.
 */
@Module({
    imports: [CabinetModule, MarketplaceCoreModule, HttpModule],
    controllers: [
        CabinetAdminController,
        CabinetBitrixAppAdminController,
        CabinetChecksAdminController,
        CabinetGuideAdminController,
        CabinetOrganizationAdminController,
    ],
    providers: [
        CabinetGuideService,
        CabinetCorsProbe,
        CabinetMailCheckService,
        SmtpNetworkProbe,
    ],
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
