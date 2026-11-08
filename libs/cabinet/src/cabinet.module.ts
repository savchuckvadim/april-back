import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '@lib/auth';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { EgressProxyModule } from '@lib/egress-proxy';
import { TelegramService } from '@lib/telegram';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { CabinetConfig } from './config/cabinet.config';
import { CabinetPortalRepository } from './persistence/cabinet-portal.repository';
import { CabinetUserRepository } from './persistence/cabinet-user.repository';
import { CabinetMembershipRepository } from './persistence/cabinet-membership.repository';
import { CabinetTokenRepository } from './persistence/cabinet-token.repository';
import { CabinetTelegramBindingRepository } from './persistence/cabinet-telegram-binding.repository';
import { PasswordHasher } from './infrastructure/password-hasher';
import { CabinetThrottle } from './infrastructure/cabinet-throttle';
import { CabinetMailer } from './infrastructure/cabinet-mailer.port';
import { CabinetMailerService } from './infrastructure/cabinet-mailer.service';
import { CabinetVendorNotifier } from './infrastructure/cabinet-vendor-notifier';
import { CabinetAccessService } from './access/cabinet-access.service';
import { CabinetAccessGuard } from './access/cabinet-access.guard';
import { CabinetAccountProvisioner } from './members/cabinet-account-provisioner';
import { CabinetMembershipService } from './members/cabinet-membership.service';
import { CabinetInviteService } from './members/cabinet-invite.service';
import { CabinetPortalService } from './portals/cabinet-portal.service';
import { CabinetFrameAccessService } from './frame/cabinet-frame-access.service';
import { CabinetPasswordService } from './session/cabinet-password.service';
import { CabinetSessionService } from './session/cabinet-session.service';
import { ClientTelegramBotClient } from './telegram/client-telegram-bot.client';
import { CabinetTelegramLinkService } from './telegram/cabinet-telegram-link.service';
import { ClientTelegramUpdateHandler } from './telegram/client-telegram-update.handler';
import { CabinetTelegramDeliveryService } from './telegram/cabinet-telegram-delivery.service';
import { CabinetAdminService } from './admin/cabinet-admin.service';
import { CabinetChannelCheckService } from './admin/cabinet-channel-check.service';
import { CabinetAppStatusService } from './admin/cabinet-app-status.service';

/**
 * Кабинет клиента-портала — сервисы БЕЗ контроллеров (решение владельца
 * 07.11.2026): учётки и доступы к порталам, вход с сайта, пароли по
 * ссылкам, привязка Telegram. Роуты — в отдельных модулях-обёртках
 * (правило ai/rules/app-api-surface.md): {@link CabinetApiModule} — pbx,
 * {@link CabinetAdminModule} — admin, {@link CabinetTelegramWebhookModule} — bot.
 *
 * Требует от приложения: глобальный ConfigModule; почтовый транспорт —
 * необязателен (без него письма «не уходят», ссылки отдаются админу).
 * AuthModule.forIssuer — выпуск/проверка токенов на общем секрете.
 */
@Module({
    imports: [
        PrismaModule,
        RedisModule,
        HttpModule,
        EgressProxyModule,
        PortalAppSettingsModule,
        AuthModule.forIssuer(),
    ],
    providers: [
        CabinetConfig,
        CabinetPortalRepository,
        CabinetUserRepository,
        CabinetMembershipRepository,
        CabinetTokenRepository,
        CabinetTelegramBindingRepository,
        PasswordHasher,
        CabinetThrottle,
        { provide: CabinetMailer, useClass: CabinetMailerService },
        // Провайдером, а не TelegramModule: его контроллер открыл бы
        // публичную ручку отправки.
        TelegramService,
        CabinetVendorNotifier,
        CabinetAccessService,
        CabinetAccessGuard,
        CabinetAccountProvisioner,
        CabinetMembershipService,
        CabinetInviteService,
        CabinetPortalService,
        CabinetFrameAccessService,
        CabinetPasswordService,
        CabinetSessionService,
        ClientTelegramBotClient,
        CabinetTelegramLinkService,
        ClientTelegramUpdateHandler,
        CabinetTelegramDeliveryService,
        CabinetAppStatusService,
        CabinetAdminService,
        CabinetChannelCheckService,
    ],
    exports: [
        CabinetConfig,
        CabinetAccessService,
        CabinetAccessGuard,
        CabinetMembershipService,
        CabinetInviteService,
        CabinetPortalService,
        CabinetFrameAccessService,
        CabinetPasswordService,
        CabinetSessionService,
        CabinetTelegramLinkService,
        ClientTelegramUpdateHandler,
        ClientTelegramBotClient,
        CabinetTelegramDeliveryService,
        CabinetAdminService,
        CabinetChannelCheckService,
    ],
})
export class CabinetModule {}
