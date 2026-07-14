import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MarketplaceInstallController } from './controllers/marketplace-install.controller';
import { MarketplaceRouterController } from './controllers/marketplace-router.controller';
import { MarketplaceEventController } from './controllers/marketplace-event.controller';
import { MarketplaceAdminController } from './controllers/marketplace-admin.controller';
import { MarketplaceInstallService } from './services/marketplace-install.service';
import { MarketplaceRouterService } from './services/marketplace-router.service';
import { MarketplaceLifecycleService } from './services/marketplace-lifecycle.service';
import { MarketplacePlacementSyncService } from './services/marketplace-placement-sync.service';
import { MarketplaceEventSyncService } from './services/marketplace-event-sync.service';
import { MarketplaceAdminService } from './services/marketplace-admin.service';
import { MarketplaceInstallRepository } from './persistence/marketplace-install.repository';
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
    controllers: [
        MarketplaceInstallController,
        MarketplaceRouterController,
        MarketplaceEventController,
        MarketplaceAdminController,
    ],
    providers: [
        MarketplaceInstallService,
        MarketplaceRouterService,
        MarketplaceLifecycleService,
        MarketplacePlacementSyncService,
        MarketplaceEventSyncService,
        MarketplaceAdminService,
        MarketplaceInstallRepository,
        MarketplaceBxClient,
        AdminKeyGuard,
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
