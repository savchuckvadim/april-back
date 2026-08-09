import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalDealModule } from './portal-deal.module';
import { PortalDealController } from './controllers/portal-deal.controller';
import { PortalDealFieldController } from './controllers/portal-deal-field.controller';

/**
 * Админ-слой доставки для PBX-сущности «deal» (CRUD строк PortalDB и полей).
 * Импортирует {@link PortalDealModule} ради сервисов и регистрирует ТОЛЬКО
 * контроллеры. Подключать в приложении админки, а НЕ в event-sales и др. —
 * см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalDealModule, PbxFieldModule],
    controllers: [PortalDealController, PortalDealFieldController],
})
export class PortalDealAdminModule {}
