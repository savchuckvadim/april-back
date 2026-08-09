import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalCompanyModule } from './portal-company.module';
import { PortalCompanyController } from './controllers/portal-company.controller';
import { PortalCompanyFieldController } from './controllers/portal-company-field.controller';

/**
 * Админ-слой доставки для PBX-сущности «company» (CRUD строк PortalDB и полей).
 * Импортирует {@link PortalCompanyModule} ради сервисов и регистрирует ТОЛЬКО
 * контроллеры. Подключать в приложении админки, а НЕ в event-sales и др. —
 * см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalCompanyModule, PbxFieldModule],
    controllers: [PortalCompanyController, PortalCompanyFieldController],
})
export class PortalCompanyAdminModule {}
