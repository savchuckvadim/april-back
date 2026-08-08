import { Module } from '@nestjs/common';
import { PortalContactModule } from './portal-contact.module';
import { PortalContactController } from './controllers/portal-contact.controller';
import { PortalContactFieldController } from './controllers/portal-contact-field.controller';

/**
 * Админ-слой доставки для PBX-сущности «contact» (CRUD строк PortalDB и полей).
 * Импортирует {@link PortalContactModule} ради сервисов и регистрирует ТОЛЬКО
 * контроллеры. Подключать в приложении админки, а НЕ в event-sales и др. —
 * см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalContactModule],
    controllers: [PortalContactController, PortalContactFieldController],
})
export class PortalContactAdminModule {}
