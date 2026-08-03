import { Module } from '@nestjs/common';
import { PortalStoreModule } from '../portal-store.module';
import { PortalAiSettingsController } from './portal-ai-settings.controller';

/**
 * Админ-слой доставки для настроек AI портала
 * (`admin/portal/:portalId/ai-settings`). Импортирует {@link PortalStoreModule}
 * ради `PortalAiSettingsService` и регистрирует только админ-контроллер.
 * Подключать в приложении админки, а НЕ в event-sales/konstructor и т.п.:
 * прикладным приложениям нужен сервис, а не роут в их Swagger.
 */
@Module({
    imports: [PortalStoreModule],
    controllers: [PortalAiSettingsController],
})
export class PortalAiSettingsAdminModule {}
