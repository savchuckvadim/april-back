import { Module } from '@nestjs/common';
import { PortalStoreModule } from './portal-store.module';
import { PortalController } from './portal.controller';
import { PortalOuterController } from './outer/portal-outer.controller';

/**
 * Админ-слой доставки хранилища портала: CRUD порталов и outer-интеграция.
 * Импортирует {@link PortalStoreModule} ради сервисов и регистрирует ТОЛЬКО
 * контроллеры. Подключать в приложении админки (и там, где эти роуты
 * действительно нужны), а НЕ в event-sales — см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalStoreModule],
    controllers: [PortalController, PortalOuterController],
})
export class PortalStoreAdminModule {}
