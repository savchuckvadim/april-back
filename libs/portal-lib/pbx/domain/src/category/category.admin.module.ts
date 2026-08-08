import { Module } from '@nestjs/common';
import { PortalCategoryModule } from './category.module';
import { PortalCategoryAdminController } from './controllers/portal-category.admin.controller';

/**
 * Админ-слой доставки для категорий PortalDB (`admin/btx-categories`).
 * Импортирует {@link PortalCategoryModule} ради сервисов и регистрирует
 * ТОЛЬКО контроллер. Подключать в приложении админки, а не в event-sales —
 * см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalCategoryModule],
    controllers: [PortalCategoryAdminController],
})
export class PortalCategoryAdminModule {}
