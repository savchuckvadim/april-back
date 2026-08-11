import { Module } from '@nestjs/common';
import { PortalAppSettingsModule } from './portal-app-settings.module';
import { PortalAppSettingsController } from './portal-app-settings.controller';

/**
 * Админ-слой доставки настроек приложений портала
 * (`admin/portal/:portalId/app-settings`). Импортирует лёгкий
 * {@link PortalAppSettingsModule} ради сервиса и регистрирует только
 * админ-контроллер. Подключать в приложении админки, а НЕ в
 * event-sales/konstructor: прикладным приложениям нужен сервис
 * (`resolve(domain, app)`), а не роут в их Swagger
 * (см. ai/rules/app-api-surface.md).
 */
@Module({
    imports: [PortalAppSettingsModule],
    controllers: [PortalAppSettingsController],
})
export class PortalAppSettingsAdminModule {}
