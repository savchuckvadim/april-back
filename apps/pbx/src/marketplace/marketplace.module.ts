import { Module } from '@nestjs/common';
import { BitrixSetupAppModule } from '@lib/bitrix-setup/app/bitrix-setup-app.module';
import { MarketplaceInstallController } from './controllers/marketplace-install.controller';
import { MarketplaceRouterController } from './controllers/marketplace-router.controller';
import { MarketplaceInstallService } from './services/marketplace-install.service';
import { MarketplaceRouterService } from './services/marketplace-router.service';

/**
 * Модуль установки тиражного маркетплейс-приложения «Менеджер Гарант».
 *
 * Новая маркетплейс-версия install-флоу (легаси в apps/back/bitrix-app-client
 * не трогается и продолжает работать). Хранение — через существующие сервисы
 * @lib/bitrix-setup (portal создаётся автоматически при первой установке).
 */
@Module({
    imports: [BitrixSetupAppModule],
    controllers: [MarketplaceInstallController, MarketplaceRouterController],
    providers: [MarketplaceInstallService, MarketplaceRouterService],
    exports: [MarketplaceInstallService, MarketplaceRouterService],
})
export class MarketplaceModule {}
