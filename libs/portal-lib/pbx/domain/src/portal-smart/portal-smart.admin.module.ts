import { Module } from '@nestjs/common';
import { PortalSmartModule } from './portal-smart.module';
import { PortalSmartController } from './controllers/portal-smart.controller';

/**
 * Админ-слой доставки смарт-процессов PortalDB.
 * Импортирует {@link PortalSmartModule} ради сервисов и регистрирует ТОЛЬКО
 * контроллер. Подключать в админке, а не в event-sales (роуты приходили
 * туда транзитом через call-lib) — см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalSmartModule],
    controllers: [PortalSmartController],
})
export class PortalSmartAdminModule {}
