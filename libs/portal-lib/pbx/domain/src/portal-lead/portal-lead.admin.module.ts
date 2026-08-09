import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalLeadModule } from './portal-lead.module';
import { PortalLeadController } from './controllers/portal-lead.controller';
import { PortalLeadFieldController } from './controllers/portal-lead-field.controller';

/**
 * Админ-слой доставки для PBX-сущности «lead» (CRUD строк PortalDB и полей).
 * Импортирует {@link PortalLeadModule} ради сервисов и регистрирует ТОЛЬКО
 * контроллеры. Подключать в приложении админки, а НЕ в event-sales и др. —
 * см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalLeadModule, PbxFieldModule],
    controllers: [PortalLeadController, PortalLeadFieldController],
})
export class PortalLeadAdminModule {}
