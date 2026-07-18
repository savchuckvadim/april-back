import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '@lib/auth';
import { TelegramService } from '@lib/telegram';
import { MarketplaceCoreModule } from '@lib/marketplace-core';
import { QueueModule } from '@lib/queue';
import { RedisModule } from '@/core/redis/redis.module';
import { MarketplaceInstallController } from './controllers/marketplace-install.controller';
import { MarketplaceRouterController } from './controllers/marketplace-router.controller';
import { MarketplaceEventController } from './controllers/marketplace-event.controller';
import { MarketplaceAdminController } from './controllers/marketplace-admin.controller';
import { MarketplaceSessionController } from './controllers/marketplace-session.controller';
import { MarketplaceOnboardingController } from './controllers/marketplace-onboarding.controller';
import { MarketplaceCabinetController } from './controllers/marketplace-cabinet.controller';
import { MarketplaceInstallService } from './services/marketplace-install.service';
import { MarketplaceRouterService } from './services/marketplace-router.service';
import { MarketplaceLifecycleService } from './services/marketplace-lifecycle.service';
import { MarketplacePlacementSyncService } from './services/marketplace-placement-sync.service';
import { MarketplaceEventSyncService } from './services/marketplace-event-sync.service';
import { MarketplaceAdminService } from './services/marketplace-admin.service';
import { MarketplaceProductService } from './services/marketplace-product.service';
import { MarketplaceSessionService } from './services/marketplace-session.service';
import { MarketplaceOnboardingService } from './services/marketplace-onboarding.service';
import { MarketplaceCabinetService } from './services/marketplace-cabinet.service';
import { MarketplaceInstallRepository } from './persistence/marketplace-install.repository';
import { PortalSessionGuard } from './lib/portal-session.guard';
import { MarketplaceBxClient } from './clients/marketplace-bx.client';
import { BitrixRequestLoggerMiddleware } from './lib/bitrix-request-logger.middleware';
import { AdminKeyGuard } from './lib/admin-key.guard';

/**
 * Модуль маркетплейс-приложения «Менеджер Гарант».
 *
 * Полный install-флоу на СОБСТВЕННЫХ таблицах (marketplace_installs,
 * portal_products, marketplace_install_components, bitrix_app_events);
 * легаси bitrix_apps/bitrix_tokens и apps/back/bitrix-app-client
 * не используются и не трогаются.
 *
 * Контроллеры:
 *  - install: установка (оба канала) + пайплайн event.bind/placement.bind
 *  - router: открытия приложения/плейсментов → токены → redirect на фронт
 *  - event: события жизненного цикла (guard по application_token)
 *
 * PrismaService — из глобального PrismaModule (подключён в AppModule).
 */
@Module({
    imports: [
        // forIssuer: ТОЛЬКО AuthTokenService (portal-context JWT на общем
        // AUTH_JWT_SECRET) — без контроллера /auth/* и без глобальных гардов
        // (эндпоинты маркетплейса должны оставаться открытыми для Битрикса).
        AuthModule.forIssuer(),
        RedisModule,
        // Токен-рефреш и общие статусы компонентов (общая либа с pbx-install)
        MarketplaceCoreModule,
        // Очередь provisioning pbx-сущностей (продюсер; воркер — pbx-install)
        QueueModule,
        // HttpModule — для TelegramService (см. providers)
        HttpModule,
    ],
    controllers: [
        MarketplaceInstallController,
        MarketplaceRouterController,
        MarketplaceEventController,
        MarketplaceSessionController,
        MarketplaceOnboardingController,
        MarketplaceCabinetController,
        MarketplaceAdminController,
    ],
    providers: [
        MarketplaceInstallService,
        MarketplaceRouterService,
        MarketplaceLifecycleService,
        MarketplacePlacementSyncService,
        MarketplaceEventSyncService,
        MarketplaceAdminService,
        MarketplaceProductService,
        MarketplaceSessionService,
        MarketplaceOnboardingService,
        MarketplaceCabinetService,
        MarketplaceInstallRepository,
        MarketplaceBxClient,
        AdminKeyGuard,
        PortalSessionGuard,
        // TelegramService как провайдер (НЕ TelegramModule: его контроллер
        // открыл бы публичную ручку отправки на api.pbx). Оживляет
        // @Optional-уведомления вендору (онбординг-заявки).
        TelegramService,
    ],
    exports: [MarketplaceInstallService, MarketplaceRouterService],
})
export class MarketplaceModule implements NestModule {
    /**
     * Сквозной лог всех входящих запросов от Битрикса (живой тест установки):
     * что прислали (body/query с маскированными токенами) и что мы ответили.
     */
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(BitrixRequestLoggerMiddleware)
            .forRoutes('bitrix-marketplace');
    }
}
